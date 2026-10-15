import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSync } from '../src/modules/legacy/sync.js';
import { createSnapshotCache } from '../src/modules/legacy/cache.js';
import { createSheetsClient } from '../src/modules/legacy/sheets.js';

const synced = { status: 'ok', content_hash: 'h1', db_marker: '10:10', sheet_rows: 10 };

test('first sync applies the sheet', () => {
  assert.equal(decideSync({ previous: undefined, csvHash: 'h1', sheetRows: 10, marker: '0:0' }).action, 'apply');
});

test('an unchanged sheet and untouched table are skipped', () => {
  assert.equal(decideSync({ previous: synced, csvHash: 'h1', sheetRows: 10, marker: '10:10' }).action, 'skip');
});

test('a changed sheet is applied', () => {
  assert.equal(decideSync({ previous: synced, csvHash: 'h2', sheetRows: 11, marker: '10:10' }).action, 'apply');
});

test('a table changed out of band is re-synced from the sheet', () => {
  assert.equal(decideSync({ previous: synced, csvHash: 'h1', sheetRows: 10, marker: '12:15' }).action, 'apply');
});

test('force re-applies an unchanged sheet', () => {
  assert.equal(
    decideSync({ previous: synced, csvHash: 'h1', sheetRows: 10, marker: '10:10', force: true }).action,
    'apply',
  );
});

test('a previous failure is retried even when the hash matches', () => {
  const failed = { ...synced, status: 'error' };
  assert.equal(decideSync({ previous: failed, csvHash: 'h1', sheetRows: 10, marker: '10:10' }).action, 'apply');
});

test('an empty export never replaces data', () => {
  const decision = decideSync({ previous: synced, csvHash: 'h0', sheetRows: 0, marker: '10:10' });
  assert.equal(decision.action, 'reject');
  assert.match(decision.reason, /vazia/);
});

test('a sheet that shrank below half is rejected, a small cleanup is accepted', () => {
  const big = { ...synced, sheet_rows: 1784 };
  assert.equal(decideSync({ previous: big, csvHash: 'x', sheetRows: 800, marker: '1:1' }).action, 'reject');
  assert.equal(decideSync({ previous: big, csvHash: 'x', sheetRows: 1700, marker: '1:1' }).action, 'apply');
  const tiny = { ...synced, sheet_rows: 5 };
  assert.equal(decideSync({ previous: tiny, csvHash: 'x', sheetRows: 1, marker: '1:1' }).action, 'apply');
});

test('snapshot cache reuses a value while the key is unchanged and recomputes when it changes', async () => {
  let key = 'a';
  let computed = 0;
  const get = createSnapshotCache(
    async () => key,
    async () => ({ value: ++computed }),
  );
  assert.equal((await get()).value, 1);
  assert.equal((await get()).value, 1);
  key = 'b';
  assert.equal((await get()).value, 2);
  assert.equal(computed, 2);
});

test('concurrent callers share one computation', async () => {
  let computed = 0;
  const get = createSnapshotCache(
    async () => 'k',
    async () => {
      computed++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return computed;
    },
  );
  const results = await Promise.all([get(), get(), get(), get()]);
  assert.deepEqual(results, [1, 1, 1, 1]);
  assert.equal(computed, 1);
});

test('a failed computation is not cached', async () => {
  let attempts = 0;
  const get = createSnapshotCache(
    async () => 'k',
    async () => {
      attempts++;
      if (attempts === 1) throw new Error('boom');
      return 'ok';
    },
  );
  await assert.rejects(get(), /boom/);
  assert.equal(await get(), 'ok');
});

function fakeGoogle({ tokenStatus = 200, exportStatus = 200 } = {}) {
  const calls = { token: 0, export: 0, authorization: [], urls: [] };
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      calls.token++;
      return tokenStatus === 200
        ? new Response(JSON.stringify({ access_token: 'access-123', expires_in: 3600 }), { status: 200 })
        : new Response('{"error":"invalid_grant"}', { status: tokenStatus });
    }
    calls.export++;
    calls.urls.push(String(url));
    calls.authorization.push(options.headers?.Authorization);
    return exportStatus === 200
      ? new Response('a,b\n1,2\n', { status: 200 })
      : new Response('forbidden', { status: exportStatus });
  };
  return { fetchImpl, calls };
}

const credentials = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh-xyz' };

test('the Google client exports CSV and reuses the access token', async () => {
  const { fetchImpl, calls } = fakeGoogle();
  const client = createSheetsClient(credentials, fetchImpl);
  assert.equal(await client.exportCsv('SHEETID123456789012345'), 'a,b\n1,2\n');
  await client.exportCsv('SHEETID123456789012345');
  assert.equal(calls.token, 1);
  assert.equal(calls.export, 2);
  assert.equal(calls.authorization[0], 'Bearer access-123');
  assert.match(calls.urls[0], /\/files\/SHEETID123456789012345\/export\?mimeType=text%2Fcsv$/);
});

test('Google errors report the status without leaking tokens', async () => {
  const exportFailure = createSheetsClient(credentials, fakeGoogle({ exportStatus: 403 }).fetchImpl);
  await assert.rejects(exportFailure.exportCsv('SHEETID123456789012345'), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.ok(!/access-123|refresh-xyz|secret/.test(error.message));
    return true;
  });
  const tokenFailure = createSheetsClient(credentials, fakeGoogle({ tokenStatus: 400 }).fetchImpl);
  await assert.rejects(tokenFailure.exportCsv('SHEETID123456789012345'), (error) => {
    assert.match(error.message, /token refresh failed \(HTTP 400\)/);
    assert.ok(!/refresh-xyz|invalid_grant/.test(error.message));
    return true;
  });
});
