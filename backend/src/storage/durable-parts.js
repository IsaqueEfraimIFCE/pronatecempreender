import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Gateways may keep native multipart state only in memory. Persist each part as
// an ordinary private object, so gateway/app restarts cannot lose acknowledged parts.
export function createDurablePartsStorage(base, client, signingClient, bucket) {
  const send = (Command, input) => client.send(new Command({ Bucket: bucket, ...input }), {
    abortSignal: AbortSignal.timeout(240000),
  });
  function prefix(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid durable upload identifier');
    return `_uploads/${id}/`;
  }
  const manifestKey = (id) => `${prefix(id)}manifest.json`;
  async function manifest(key, id) {
    const object = await send(GetObjectCommand, { Key: manifestKey(id) });
    const metadata = JSON.parse(await object.Body.transformToString());
    if (metadata.key !== key) throw new Error('Upload object mismatch');
    return metadata;
  }
  async function listed(id) {
    const result = [];
    let token;
    do {
      const page = await send(ListObjectsV2Command, {
        Prefix: prefix(id), ContinuationToken: token,
      });
      result.push(...(page.Contents || []));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return result;
  }
  async function cleanup(key, id) {
    // All identifiers/keys originate in the database; never accept client prefixes.
    const items = await listed(id);
    if (!items.length) return;
    await manifest(key, id);
    for (const item of items.filter((item) => item.Key !== manifestKey(id)))
      await send(DeleteObjectCommand, { Key: item.Key });
    await send(DeleteObjectCommand, { Key: manifestKey(id) });
  }
  return {
    ...base,
    cleanupCompleted: cleanup,
    async create(key, fingerprint) {
      const id = randomUUID();
      await send(PutObjectCommand, {
        Key: manifestKey(id), Body: JSON.stringify({ key, fingerprint }),
        ContentType: 'application/json',
      });
      return id;
    },
    async signPart(key, id, number, size) {
      await manifest(key, id);
      if (!Number.isInteger(number) || number < 1 || number > 13 ||
          !Number.isSafeInteger(size) || size < 1 || size > 8 * 1024 ** 2)
        throw new Error('Invalid durable part');
      return getSignedUrl(signingClient, new PutObjectCommand({
        Bucket: bucket, Key: `${prefix(id)}${String(number).padStart(5, '0')}`,
        ContentLength: size,
      }), { expiresIn: 300 });
    },
    async parts(key, id) {
      await manifest(key, id);
      return (await listed(id))
        .filter((item) => /^\d{5}$/.test(item.Key.slice(prefix(id).length)))
        .map((item) => ({ PartNumber: Number(item.Key.slice(-5)), Size: item.Size, ETag: item.ETag }));
    },
    async complete(key, id, parts) {
      const metadata = await manifest(key, id);
      const sorted = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
      if (!sorted.length || sorted.length > 13 ||
          sorted.some((part, index) => part.PartNumber !== index + 1 ||
            !Number.isSafeInteger(Number(part.Size)) || Number(part.Size) < 1 || Number(part.Size) > 8 * 1024 ** 2))
        throw new Error('Invalid durable parts');
      const total = sorted.reduce((sum, part) => sum + Number(part.Size), 0);
      if (total > 100 * 1024 ** 2) throw new Error('Durable upload exceeds size limit');
      async function* bytes() {
        for (const part of sorted) {
          const object = await send(GetObjectCommand, {
            Key: `${prefix(id)}${String(part.PartNumber).padStart(5, '0')}`,
          });
          let received = 0;
          for await (const chunk of object.Body) {
            received += chunk.length;
            if (received > Number(part.Size)) throw new Error('Part size changed');
            yield chunk;
          }
          if (received !== Number(part.Size)) throw new Error('Part size changed');
        }
      }
      const body = Readable.from(bytes(), { objectMode: false });
      try {
        await send(PutObjectCommand, {
          Key: key, Body: body, ContentLength: total,
          ContentType: 'application/octet-stream', Metadata: { fingerprint: metadata.fingerprint },
        });
      } finally {
        body.destroy();
      }
      // Keep parts until the worker commits validation, allowing retry after a
      // gateway restart even when the gateway's in-memory metadata is gone.
    },
    abort: cleanup,
  };
}
