import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { readConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { createStorage } from '../src/storage/s3.js';
import { validateStoredReport } from '../src/validation/process.js';
import { scanFile } from '../src/validation/clamav.js';
import { RejectedFile } from '../src/validation/formats.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const config = readConfig();
const pool = createPool(config);
const storage = createStorage(config);
const statePath = join(tmpdir(), 'pronatec-production-smoke.json');
const first = Buffer.alloc(8 * 1024 ** 2, 32);
first.write('%PDF-1.7\n');
const last = Buffer.from('\nSynthetic production infrastructure check\n%%EOF\n');
const fingerprint = createHash('sha256').update(first).update(last).digest('hex');
try {
  const tls = await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
  assert.equal(tls.rows[0]?.ssl, true);
  console.log('Database connection uses verified TLS.');
  await storage.ready();
  const phase = process.argv[2];
  if (phase === 'prepare') {
    const key = `_checks/${randomUUID()}.pdf`;
    const id = await storage.create(key, fingerprint);
    await writeFile(statePath, JSON.stringify({ key, id }), { mode: 0o600 });
    const url = await storage.signPart(key, id, 1, first.length);
    const response = await fetch(url, { method: 'PUT', body: first, signal: AbortSignal.timeout(180000) });
    assert.equal(response.ok, true, `Part upload status: ${response.status}`);
    assert.equal((await storage.parts(key, id)).length, 1);
    console.log('First 8 MiB part acknowledged; ready for gateway restart.');
  } else if (phase === 'finish') {
    const { key, id } = JSON.parse(await readFile(statePath, 'utf8'));
    try {
      assert.equal((await storage.parts(key, id)).length, 1);
      const url = await storage.signPart(key, id, 2, last.length);
      const response = await fetch(url, { method: 'PUT', body: last, signal: AbortSignal.timeout(180000) });
      assert.equal(response.ok, true, `Part upload status: ${response.status}`);
      await storage.complete(key, id, await storage.parts(key, id));
      const head = await storage.head(key);
      assert.equal(Number(head.ContentLength), first.length + last.length);
      assert.equal(await validateStoredReport({
        object_key: key, size_bytes: first.length + last.length,
        metadata: { fingerprint, extension: 'pdf' },
      }, storage, config), fingerprint);
      console.log('Gateway restart/resume, assembly, SHA-256, PDF check and real clean scan passed.');
      const unauth = await fetch(`${config.s3.endpoint}/${config.s3.bucket}/${key}`);
      assert.equal([400, 401, 403].includes(unauth.status), true);
      console.log('Anonymous file access denied.');
      const eicarPath = join(tmpdir(), `pronatec-eicar-${randomUUID()}`);
      try {
        const eicar = Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=', 'base64');
        await writeFile(eicarPath, eicar, { mode: 0o600 });
        await assert.rejects(() => scanFile(eicarPath, config), RejectedFile);
        console.log('Isolated EICAR test rejected by real ClamAV.');
      } finally { await unlink(eicarPath).catch(() => {}); }
    } finally {
      await storage.abort(key, id);
      await storage.remove(key);
      await unlink(statePath).catch(() => {});
    }
  } else throw new Error('Choose prepare or finish');
} catch (error) {
  console.error('Service verification failed:', error.name, error.code || '', error.$metadata?.httpStatusCode || '');
  process.exitCode = 1;
} finally { await pool.end(); }
