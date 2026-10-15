import { validateReport, InputError, PART_BYTES } from '@pronatec/shared';
import { transaction } from '../../db/pool.js';
import {
  digest,
  keyed,
  secureEqual,
  uuid,
  resumeSecret,
  rateLimit,
  captcha,
} from '../../security.js';

export function reportService(pool, storage, config) {
  const sizeOf = (row, number) =>
    Math.min(PART_BYTES, Number(row.size_bytes) - (number - 1) * PART_BYTES);
  async function authorized(id, secret, client = pool) {
    uuid(id);
    resumeSecret(secret);
    const row = (await client.query('SELECT * FROM reports WHERE id=$1', [id])).rows[0];
    if (!row || !secureEqual(row.resume_hash, keyed(config, secret)))
      throw Object.assign(new Error('Envio não encontrado.'), { statusCode: 404 });
    return row;
  }
  return {
    async initialize(input, ip) {
      const id = uuid(input.id),
        secret = resumeSecret(input.secret),
        metadata = validateReport(input);
      const hash = digest(JSON.stringify(metadata));
      const existing = (await pool.query('SELECT * FROM reports WHERE id=$1', [id])).rows[0];
      if (existing) {
        await authorized(id, secret);
        if (existing.metadata_hash !== hash)
          throw new InputError('Os dados deste envio já estão definidos.');
        return { id, status: existing.status };
      }
      await rateLimit(pool, `upload:${keyed(config, ip)}`, config.uploadLimit);
      await captcha(config, input.captchaToken);
      return transaction(pool, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(914073)');
        const previous = (await client.query('SELECT * FROM reports WHERE id=$1', [id])).rows[0];
        if (previous) {
          if (!secureEqual(previous.resume_hash, keyed(config, secret)))
            throw Object.assign(new Error('Envio não encontrado.'), { statusCode: 404 });
          if (previous.metadata_hash !== hash)
            throw new InputError('Os dados deste envio já estão definidos.');
          return { id, status: previous.status };
        }
        const quotas = (
          await client.query(
            "SELECT COALESCE(SUM(size_bytes) FILTER (WHERE status NOT IN ('expired','failed','rejected')),0) AS total, COALESCE(SUM(size_bytes) FILTER (WHERE created_at >= CURRENT_DATE),0) AS daily FROM reports",
          )
        ).rows[0];
        if (
          Number(quotas.total) + metadata.size > config.storageQuota ||
          Number(quotas.daily) + metadata.size > config.dailyQuota
        )
          throw Object.assign(new Error('Limite de recebimento atingido. Tente mais tarde.'), {
            statusCode: 429,
          });
        await client.query(
          "INSERT INTO reports(id,metadata,metadata_hash,resume_hash,origin_hash,object_key,size_bytes,status) VALUES($1,$2,$3,$4,$5,$6,$7,'initializing')",
          [
            id,
            metadata,
            hash,
            keyed(config, secret),
            keyed(config, ip),
            `reports/${id}.${metadata.extension}`,
            metadata.size,
          ],
        );
        const uploadId = await storage.create(
          `reports/${id}.${metadata.extension}`,
          metadata.fingerprint,
        );
        await client.query("UPDATE reports SET upload_id=$2,status='uploading' WHERE id=$1", [
          id,
          uploadId,
        ]);
        return { id, status: 'uploading' };
      });
    },
    async status(id, secret) {
      const row = await authorized(id, secret);
      let parts = [],
        status = row.status;
      if (row.status === 'uploading') {
        try {
          parts = await storage.parts(row.object_key, row.upload_id);
        } catch (error) {
          if (error.name !== 'NoSuchUpload') throw error;
          const head = await storage.head(row.object_key);
          if (
            Number(head.ContentLength) !== Number(row.size_bytes) ||
            head.Metadata?.fingerprint !== row.metadata.fingerprint
          )
            throw error;
          await pool.query(
            "UPDATE reports SET status='validating' WHERE id=$1 AND status='uploading'",
            [id],
          );
          status = 'validating';
        }
      }
      return {
        id,
        status,
        error: row.error,
        expiresAt: row.expires_at,
        partBytes: PART_BYTES,
        parts: parts.map((p) => ({ number: p.PartNumber, size: p.Size })),
      };
    },
    async sign(id, secret, number) {
      const row = await authorized(id, secret);
      if (row.status !== 'uploading' || new Date(row.expires_at) <= new Date())
        throw new InputError('Este envio não está disponível para upload.');
      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > Math.ceil(Number(row.size_bytes) / PART_BYTES)
      )
        throw new InputError('Parte inválida.');
      return {
        url: await storage.signPart(row.object_key, row.upload_id, number, sizeOf(row, number)),
      };
    },
    async complete(id, secret) {
      return transaction(pool, async (client) => {
        await client.query('SELECT id FROM reports WHERE id=$1 FOR UPDATE', [uuid(id)]);
        const row = await authorized(id, secret, client);
        if (['validating', 'received', 'rejected'].includes(row.status))
          return { id, status: row.status };
        if (row.status !== 'uploading' || new Date(row.expires_at) <= new Date())
          throw new InputError('Sessão de upload expirada ou indisponível.');
        let alreadyCompleted = false;
        try {
          const head = await storage.head(row.object_key);
          alreadyCompleted =
            Number(head.ContentLength) === Number(row.size_bytes) &&
            head.Metadata?.fingerprint === row.metadata.fingerprint;
        } catch (error) {
          if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound') throw error;
        }
        if (!alreadyCompleted) {
          const parts = (await storage.parts(row.object_key, row.upload_id)).sort(
            (a, b) => a.PartNumber - b.PartNumber,
          );
          if (
            parts.length !== Math.ceil(Number(row.size_bytes) / PART_BYTES) ||
            parts.some((p, i) => p.PartNumber !== i + 1 || Number(p.Size) !== sizeOf(row, i + 1))
          )
            throw new InputError('Upload incompleto. Retome as partes pendentes.');
          await storage.complete(row.object_key, row.upload_id, parts);
        }
        const head = await storage.head(row.object_key);
        if (Number(head.ContentLength) !== Number(row.size_bytes))
          throw new InputError('O tamanho do arquivo não corresponde ao informado.');
        await client.query("UPDATE reports SET status='validating' WHERE id=$1", [id]);
        return { id, status: 'validating' };
      });
    },
  };
}
