import { InputError, digits } from '@pronatec/shared';
import { transaction } from '../../db/pool.js';
import { captcha, keyed, rateLimit } from '../../security.js';
import { createSnapshotCache } from './cache.js';
import { parseCsv } from './csv-parse.js';
import { KINDS, mapHeaders, interestedRecord, offerRecord } from './mapping.js';
import { setecSummary, coordinationSummary, maskName } from './summary.js';

const LOOKUPS_PER_HOUR = 30;
const MAX_SUMMARY_ROWS = 200000;
const TABLES = { interested: 'legacy_interested', offers: 'legacy_offers' };

// What makes two sheet rows "the same row". Identical rows get an occurrence index so
// the table can mirror the sheet exactly instead of collapsing repeated lines.
const IDENTITY = {
  interested: (r) => [r.cpf, r.submittedText, r.name, r.fields],
  offers: (r) => [r.institution, r.campus, r.region, r.course, r.vacancies, r.startMonth],
};

export function legacyService(pool, config) {
  const rowHash = (parts) => keyed(config, JSON.stringify(parts));

  async function insertInterested(client, record, hash) {
    const { rowCount } = await client.query(
      'INSERT INTO legacy_interested(cpf_hash,name,course,fields,submitted_at,row_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(row_hash) DO NOTHING',
      [
        record.cpf ? keyed(config, record.cpf) : '',
        record.name,
        record.course,
        JSON.stringify(record.fields),
        record.submittedAt,
        hash,
      ],
    );
    return rowCount;
  }

  async function insertOffer(client, record, hash) {
    const { rowCount } = await client.query(
      'INSERT INTO legacy_offers(institution,campus,region,course,vacancies,start_month,row_hash) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(row_hash) DO NOTHING',
      [
        record.institution,
        record.campus,
        record.region,
        record.course,
        record.vacancies,
        record.startMonth,
        hash,
      ],
    );
    return rowCount;
  }

  // Cheap fingerprint of both tables; a changed key means the cached summaries are stale.
  async function snapshotKey() {
    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM legacy_interested) AS ic,
              (SELECT COALESCE(max(id),0) FROM legacy_interested) AS im,
              (SELECT count(*) FROM legacy_offers) AS oc,
              (SELECT COALESCE(max(id),0) FROM legacy_offers) AS om`,
    );
    const r = rows[0];
    return `${r.ic}:${r.im}:${r.oc}:${r.om}`;
  }

  async function computeSetec() {
    const { rows } = await pool.query(
      'SELECT cpf_hash AS "cpfHash",course,fields FROM legacy_interested ORDER BY id LIMIT $1',
      [MAX_SUMMARY_ROWS],
    );
    const vacancies = (
      await pool.query('SELECT COALESCE(SUM(vacancies),0)::bigint AS total FROM legacy_offers')
    ).rows[0];
    return setecSummary(rows, Number(vacancies.total));
  }

  async function computeCoordination() {
    const { rows } = await pool.query(
      'SELECT institution,campus,region,course,vacancies,start_month FROM legacy_offers ORDER BY id LIMIT $1',
      [MAX_SUMMARY_ROWS],
    );
    return coordinationSummary(rows.map((r) => ({ ...r, startMonth: r.start_month })));
  }

  const cachedSetec = createSnapshotCache(snapshotKey, computeSetec);
  const cachedCoordination = createSnapshotCache(snapshotKey, computeCoordination);

  return {
    async lookup(input, ip) {
      // The original script only required 11 digits (no checksum), so respondents
      // who typed an invalid CPF are still found.
      const cpf = digits(input?.cpf);
      if (cpf.length !== 11) throw new InputError('Confira os dados e tente novamente.');
      await rateLimit(pool, `cpf:${keyed(config, ip)}`, LOOKUPS_PER_HOUR);
      await captcha(config, input.captchaToken);
      const row = (
        await pool.query(
          'SELECT name,course FROM legacy_interested WHERE cpf_hash=$1 ORDER BY id DESC LIMIT 1',
          [keyed(config, cpf)],
        )
      ).rows[0];
      return row
        ? { ok: true, found: true, data: { name: maskName(row.name), course: row.course } }
        : { ok: true, found: false };
    },

    setecSummary: cachedSetec,
    coordinationSummary: cachedCoordination,

    async status() {
      const count = async (table) =>
        Number((await pool.query(`SELECT count(*)::bigint AS total FROM ${table}`)).rows[0].total);
      return {
        interested: await count(TABLES.interested),
        offers: await count(TABLES.offers),
      };
    },

    // CSV exported from the Google Sheet. Returns a report so an unrecognised
    // header is visible to the admin instead of silently dropping data.
    async importCsv({ kind, csv, mapping, replace }) {
      if (!KINDS[kind]) throw new InputError('Tipo de importação inválido.');
      if (typeof csv !== 'string' || !csv.trim()) throw new InputError('Envie o conteúdo do CSV.');
      const overrides =
        mapping && typeof mapping === 'object' && !Array.isArray(mapping) ? mapping : {};
      const [headers, ...body] = parseCsv(csv);
      if (!headers) throw new InputError('O CSV não possui cabeçalho.');
      const { columns, unmapped, missing } = mapHeaders(kind, headers, overrides);
      if (missing.length)
        throw new InputError(
          `Colunas obrigatórias não reconhecidas: ${missing.join(', ')}. Colunas encontradas: ${headers.join(' | ')}. Reenvie com "mapping" ligando o cabeçalho ao campo.`,
        );
      const convert = kind === 'interested' ? interestedRecord : offerRecord;
      const insert = kind === 'interested' ? insertInterested : insertOffer;
      const report = { rows: body.length, inserted: 0, duplicates: 0, skipped: {}, unmapped };
      const occurrences = new Map();
      await transaction(pool, async (client) => {
        if (replace) await client.query(`DELETE FROM ${TABLES[kind]}`);
        for (const cells of body) {
          const result = convert(columns, cells);
          if (result.skip) {
            report.skipped[result.skip] = (report.skipped[result.skip] || 0) + 1;
            continue;
          }
          const parts = IDENTITY[kind](result.record);
          const identity = JSON.stringify(parts);
          const occurrence = occurrences.get(identity) || 0;
          occurrences.set(identity, occurrence + 1);
          if (await insert(client, result.record, rowHash([...parts, occurrence]))) report.inserted++;
          else report.duplicates++;
        }
        await client.query("INSERT INTO audit_events(action) VALUES('legacy_import')");
      });
      return report;
    },
  };
}
