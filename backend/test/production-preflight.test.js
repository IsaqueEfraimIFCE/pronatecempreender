import test from 'node:test';
import assert from 'node:assert/strict';
import { productionPreflight } from '../scripts/production-preflight.js';

const env = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:synthetic@database.internal/app?sslmode=verify-full',
  APP_ORIGIN: 'https://portal.example',
  SECURITY_KEY: 'x'.repeat(32),
  ADMIN_PASSWORD_HASH: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`,
  S3_ENDPOINT: 'https://storage.example',
  S3_BUCKET: 'private-reports',
  S3_ACCESS_KEY_ID: 'synthetic',
  S3_SECRET_ACCESS_KEY: 'synthetic',
  TURNSTILE_SITE_KEY: 'synthetic',
  TURNSTILE_SECRET_KEY: 'synthetic',
  CLAMD_HOST: 'scanner.internal',
};

test('production preflight rejects insecure configuration and does not return secrets', () => {
  assert.deepEqual(productionPreflight(env), { status: 'configuration-valid', checks: 6 });
  for (const override of [
    { NODE_ENV: 'development' },
    { DATABASE_URL: 'postgres://database.internal/app' },
    { DATABASE_URL: 'postgres://database.internal/app?sslmode=disable' },
    { DATABASE_URL: 'postgres://database.internal/app?sslmode=require&uselibpqcompat=true' },
    { ADMIN_PASSWORD_HASH: 'demo' },
    { CLAMD_HOST: '' },
    { CAPTCHA_TEST_BYPASS: 'true' },
    { TURNSTILE_SECRET_KEY: '' },
    { S3_ENDPOINT: 'http://storage.example' },
    { APP_ORIGIN: 'http://portal.example' },
  ]) assert.throws(() => productionPreflight({ ...env, ...override }));
});
