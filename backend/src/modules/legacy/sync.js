import { createHash } from 'node:crypto';
import { parseCsv } from './csv-parse.js';

const LOCK_ID = 914074;
const SHRINK_GUARD_MIN_ROWS = 20;
const SHRINK_RATIO = 0.5;
const TABLES = { interested: 'legacy_interested', offers: 'legacy_offers' };
const MESSAGE_LIMIT = 300;

// Decides what to do with a freshly exported sheet. The sheet is the source of truth, so
// data is replaced whenever the export changed or the table was altered out of band
// (marker mismatch), but never with an empty or drastically smaller export.
export function decideSync({ previous, csvHash, sheetRows, marker, force = false }) {
  if (sheetRows === 0)
    return { action: 'reject', reason: 'A planilha exportada está vazia; os dados atuais foram mantidos.' };
  const known = Number(previous?.sheet_rows || 0);
  if (known >= SHRINK_GUARD_MIN_ROWS && sheetRows < known * SHRINK_RATIO)
    return {
      action: 'reject',
      reason: `A planilha caiu de ${known} para ${sheetRows} linhas; os dados atuais foram mantidos. Confira a planilha ou importe o CSV manualmente.`,
    };
  const unchanged =
    previous?.status === 'ok' && previous.content_hash === csvHash && previous.db_marker === marker;
  if (unchanged && !force) return { action: 'skip' };
  return { action: 'apply' };
}

// Scheduled synchronisation of the legacy tables with their Google Sheets.
export function createSyncService({ pool, config, legacy, client }) {
  const sources = [
    { key: 'interested', kind: 'interested', table: TABLES.interested, sheetId: config.sync.responsesSheetId },
    { key: 'offers', kind: 'offers', table: TABLES.offers, sheetId: config.sync.offersSheetId },
  ].filter((source) => source.sheetId);

  async function tableMarker(table) {
    const { rows } = await pool.query(
      `SELECT count(*)::bigint AS total, COALESCE(max(id),0)::bigint AS last FROM ${table}`,
    );
    return `${rows[0].total}:${rows[0].last}`;
  }

  async function note(source, status, message, started) {
    await pool.query(
      'UPDATE legacy_sync SET status=$2,last_checked_at=now(),message=$3,duration_ms=$4 WHERE source=$1',
      [source.key, status, message ? String(message).slice(0, MESSAGE_LIMIT) : null, Date.now() - started],
    );
  }

  async function syncOne(source, { force = false } = {}) {
    const started = Date.now();
    await pool.query(
      'INSERT INTO legacy_sync(source,sheet_id) VALUES($1,$2) ON CONFLICT(source) DO UPDATE SET sheet_id=EXCLUDED.sheet_id',
      [source.key, source.sheetId],
    );
    const previous = (await pool.query('SELECT * FROM legacy_sync WHERE source=$1', [source.key]))
      .rows[0];
    try {
      const csv = await client.exportCsv(source.sheetId);
      const csvHash = createHash('sha256').update(csv).digest('hex');
      const sheetRows = Math.max(parseCsv(csv).length - 1, 0);
      const marker = await tableMarker(source.table);
      const decision = decideSync({ previous, csvHash, sheetRows, marker, force });
      if (decision.action === 'skip') {
        await note(source, 'ok', null, started);
        return { source: source.key, status: 'ok', changed: false };
      }
      if (decision.action === 'reject') {
        await note(source, 'rejected', decision.reason, started);
        return { source: source.key, status: 'rejected', message: decision.reason };
      }
      const report = await legacy.importCsv({ kind: source.kind, csv, replace: true });
      await pool.query(
        `UPDATE legacy_sync SET status='ok',content_hash=$2,db_marker=$3,last_checked_at=now(),
           last_synced_at=now(),sheet_rows=$4,stored_rows=$5,duplicates=$6,unmapped=$7,message=NULL,duration_ms=$8
         WHERE source=$1`,
        [
          source.key,
          csvHash,
          await tableMarker(source.table),
          report.rows,
          report.inserted,
          report.duplicates,
          JSON.stringify(report.unmapped),
          Date.now() - started,
        ],
      );
      return { source: source.key, status: 'ok', changed: true, rows: report.rows, stored: report.inserted };
    } catch (error) {
      await note(source, 'error', error.message, started);
      return { source: source.key, status: 'error', message: error.message.slice(0, MESSAGE_LIMIT) };
    }
  }

  return {
    enabled: sources.length > 0,

    // One pass over every configured sheet; a Postgres advisory lock keeps the web and
    // worker processes from syncing at the same time.
    async runAll(options = {}) {
      const connection = await pool.connect();
      try {
        const { rows } = await connection.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_ID]);
        if (!rows[0].locked) return { busy: true, results: [] };
        try {
          const results = [];
          for (const source of sources) results.push(await syncOne(source, options));
          return { busy: false, results };
        } finally {
          await connection.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
        }
      } finally {
        connection.release();
      }
    },

    async report() {
      const stored = new Map(
        (await pool.query('SELECT * FROM legacy_sync')).rows.map((row) => [row.source, row]),
      );
      const out = [];
      for (const source of sources) {
        const row = stored.get(source.key);
        const marker = await tableMarker(source.table);
        const dbRows = Number(marker.split(':')[0]);
        out.push({
          source: source.key,
          status: row?.status || 'pending',
          lastCheckedAt: row?.last_checked_at || null,
          lastSyncedAt: row?.last_synced_at || null,
          sheetRows: row?.sheet_rows ?? null,
          storedRows: row?.stored_rows ?? null,
          duplicates: row?.duplicates ?? null,
          dbRows,
          unmapped: row?.unmapped || [],
          message: row?.message || null,
          inSync:
            row?.status === 'ok' &&
            Number(row.stored_rows) === dbRows &&
            row.db_marker === marker,
        });
      }
      return {
        enabled: sources.length > 0,
        intervalMinutes: Math.round(config.sync.intervalMs / 60000),
        sources: out,
      };
    },
  };
}
