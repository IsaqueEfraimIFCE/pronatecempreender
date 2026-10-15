import test from 'node:test';
import assert from 'node:assert/strict';
import { csv } from '../src/modules/admin/csv.js';
import { readConfig } from '../src/config.js';
import { clientIp } from '../src/security.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyFormat } from '../src/validation/formats.js';
const env = {
  DATABASE_URL: 'postgres://localhost/test',
  APP_ORIGIN: 'https://portal.example',
  SECURITY_KEY: 'x'.repeat(32),
  ADMIN_PASSWORD_HASH: 'scrypt:salt:hash',
  S3_ENDPOINT: 'https://storage.example',
  S3_BUCKET: 'test',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
};
test('Fly client IP is opt-in, validated and independent of spoofed X-Forwarded-For', () => {
  const request = { ip: '172.19.0.1', headers: {
    'fly-client-ip': '203.0.113.12', 'x-forwarded-for': '198.51.100.99',
  } };
  assert.equal(clientIp(request, {}), '172.19.0.1');
  assert.equal(clientIp(request, { useFlyClientIp: true }), '203.0.113.12');
  request.headers['fly-client-ip'] = 'invalid';
  assert.equal(clientIp(request, { useFlyClientIp: true }), '172.19.0.1');
  assert.equal(readConfig({ ...env, TRUST_FLY_PROXY: 'true' }).useFlyClientIp, false);
});
test('production refuses CAPTCHA bypass and missing keys', () => {
  assert.throws(() => readConfig({ ...env, NODE_ENV: 'production' }));
  assert.throws(() =>
    readConfig({
      ...env,
      NODE_ENV: 'production',
      TURNSTILE_SECRET_KEY: 'secret',
      TURNSTILE_SITE_KEY: 'site',
      CAPTCHA_TEST_BYPASS: 'true',
    }),
  );
  assert.equal(readConfig({ ...env, CAPTCHA_TEST_BYPASS: 'true' }).bypass, true);
});
test('CSV quotes values and neutralizes formulas', () => {
  const result = csv([['=CMD()', ' \t+SUM(1)', 'a"b', '52998224725']]);
  assert.ok(result.includes('"\'=CMD()"'));
  assert.ok(result.includes('"\' \t+SUM(1)"'));
  assert.ok(result.includes('"a""b"'));
  assert.ok(result.includes('"52998224725"'));
});
test('extension alone cannot make an executable a PDF', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pronatec-test-'));
  try {
    const path = join(dir, 'fake.pdf');
    await writeFile(path, 'MZ executable');
    await assert.rejects(() => verifyFormat(path, 'pdf'));
    await writeFile(path, '%PDF-1.7\n%%EOF');
    await verifyFormat(path, 'pdf');
    await writeFile(path, '%PDF-1.7\n/Encrypt 1 0 R\n%%EOF');
    await assert.rejects(() => verifyFormat(path, 'pdf'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
