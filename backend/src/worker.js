import { readConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createStorage } from './storage/s3.js';
import { validateStoredReport } from './validation/process.js';
import { RejectedFile } from './validation/formats.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { legacyService } from './modules/legacy/service.js';
import { createSheetsClient } from './modules/legacy/sheets.js';
import { createSyncService } from './modules/legacy/sync.js';
const config = readConfig(),
  pool = createPool(config),
  storage = createStorage(config);
const sync = config.sync.enabled
  ? createSyncService({
      pool,
      config,
      legacy: legacyService(pool, config),
      client: createSheetsClient(config.sync),
    })
  : null;
let nextSync = 0;
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    stopping = true;
  });
while (!stopping) {
  try {
    if (sync && Date.now() >= nextSync) {
      nextSync = Date.now() + config.sync.intervalMs;
      const outcome = await sync.runAll();
      console.log(
        outcome.busy
          ? 'Sheet sync skipped: another run holds the lock'
          : `Sheet sync: ${outcome.results.map((r) => `${r.source}=${r.status}${r.changed ? '(updated)' : ''}`).join(' ')}`,
      );
    }
    if (storage.cleanupCompleted) {
      const completed = (await pool.query(
        "SELECT id,object_key,upload_id FROM reports WHERE status='received' AND upload_id IS NOT NULL LIMIT 20",
      )).rows;
      for (const report of completed) {
        try {
          await storage.cleanupCompleted(report.object_key, report.upload_id);
          await pool.query('UPDATE reports SET upload_id=NULL WHERE id=$1', [report.id]);
        } catch {
          console.warn('Completed upload cleanup deferred');
        }
      }
    }
    await pool.query(
      "UPDATE reports SET status='expired' WHERE status IN ('initializing','uploading') AND expires_at<now()",
    );
    const expired = (
      await pool.query(
        "SELECT id,object_key,upload_id,status FROM reports WHERE status IN ('expired','rejected') AND storage_deleted_at IS NULL ORDER BY created_at LIMIT 20",
      )
    ).rows;
    for (const row of expired) {
      try {
        if (row.upload_id) {
          try {
            await storage.abort(row.object_key, row.upload_id);
          } catch (error) {
            if (error.name !== 'NoSuchUpload') throw error;
          }
        }
        await storage.remove(row.object_key);
        await pool.query('UPDATE reports SET upload_id=NULL,storage_deleted_at=now() WHERE id=$1', [
          row.id,
        ]);
      } catch {
        console.warn('Storage cleanup deferred');
      }
    }
    await pool.query('DELETE FROM admin_sessions WHERE expires_at<now()');
    await pool.query('DELETE FROM rate_windows WHERE expires_at<now()');
    await pool.query(
      "UPDATE reports SET origin_hash=NULL WHERE origin_hash IS NOT NULL AND created_at<now()-interval '24 hours'",
    );
    const row = (
      await pool.query(
        "UPDATE reports SET validation_lease=now()+interval '5 minutes',attempts=attempts+1 WHERE id=(SELECT id FROM reports WHERE status='validating' AND (validation_lease IS NULL OR validation_lease<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",
      )
    ).rows[0];
    if (!row) {
      await sleep(3000);
      continue;
    }
    try {
      const hash = await validateStoredReport(row, storage, config);
      await pool.query(
        "UPDATE reports SET status='received',sha256=$2,received_at=now(),error=NULL,upload_id=CASE WHEN $3 THEN upload_id ELSE NULL END WHERE id=$1 AND status='validating'",
        [row.id, hash, Boolean(storage.cleanupCompleted)],
      );
    } catch (error) {
      if (error instanceof RejectedFile)
        await pool.query("UPDATE reports SET status='rejected',error=$2 WHERE id=$1", [
          row.id,
          error.message,
        ]);
      else {
        await pool.query(
          "UPDATE reports SET validation_lease=now()+interval '1 minute' WHERE id=$1",
          [row.id],
        );
        console.warn('Validation deferred; scanner or storage unavailable');
      }
    }
  } catch {
    console.warn('Worker unavailable; retrying');
    await sleep(5000);
  }
}
await pool.end();
