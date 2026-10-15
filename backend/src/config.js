import { fileURLToPath } from 'node:url';
export function readConfig(env = process.env) {
  const required = [
    'DATABASE_URL',
    'APP_ORIGIN',
    'SECURITY_KEY',
    'ADMIN_PASSWORD_HASH',
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ];
  for (const key of required)
    if (!env[key]) throw new Error(`Missing required configuration: ${key}`);
  if (env.SECURITY_KEY.length < 32)
    throw new Error('SECURITY_KEY must have at least 32 characters.');
  const dashboardKey = env.DASHBOARD_ACCESS_KEY || '';
  if (dashboardKey && dashboardKey.length < 6)
    throw new Error('DASHBOARD_ACCESS_KEY must have at least 6 characters.');
  const production = env.NODE_ENV === 'production';
  if (
    production &&
    (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY || env.CAPTCHA_TEST_BYPASS === 'true')
  )
    throw new Error('Production requires Turnstile; test bypass is forbidden.');
  const origin = new URL(env.APP_ORIGIN).origin;
  if (production && !origin.startsWith('https://')) throw new Error('Production requires HTTPS.');
  if (
    production &&
    [env.S3_ENDPOINT, env.S3_SIGNING_ENDPOINT || env.S3_ENDPOINT].some(
      (endpoint) => new URL(endpoint).protocol !== 'https:',
    )
  )
    throw new Error('Production storage requires HTTPS.');
  const integer = (key, fallback) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${key}`);
    return value;
  };
  const sheetId = (value) => {
    if (!value) return '';
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(value)) throw new Error('Invalid Google Sheet id.');
    return value;
  };
  return {
    production,
    useFlyClientIp: env.TRUST_FLY_PROXY === 'true' && Boolean(env.FLY_APP_NAME),
    origin,
    port: integer('PORT', 8080),
    databaseUrl: env.DATABASE_URL,
    securityKey: env.SECURITY_KEY,
    adminHash: env.ADMIN_PASSWORD_HASH,
    dashboardKey,
    captchaSecret: env.TURNSTILE_SECRET_KEY,
    captchaSiteKey: env.TURNSTILE_SITE_KEY,
    bypass: !production && env.CAPTCHA_TEST_BYPASS === 'true',
    s3: {
      durableParts: env.S3_DURABLE_PARTS === 'true',
      endpoint: env.S3_ENDPOINT,
      signingEndpoint: env.S3_SIGNING_ENDPOINT || env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION || 'auto',
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    },
    // Scheduled Google Sheets -> PostgreSQL sync; disabled unless a read-only token and
    // at least one sheet id are configured.
    sync: {
      enabled: Boolean(
        env.GOOGLE_CLIENT_ID &&
          env.GOOGLE_CLIENT_SECRET &&
          env.GOOGLE_REFRESH_TOKEN &&
          (env.LEGACY_RESPONSES_SHEET_ID || env.LEGACY_OFFERS_SHEET_ID),
      ),
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      refreshToken: env.GOOGLE_REFRESH_TOKEN || '',
      responsesSheetId: sheetId(env.LEGACY_RESPONSES_SHEET_ID),
      offersSheetId: sheetId(env.LEGACY_OFFERS_SHEET_ID),
      intervalMs: integer('SYNC_INTERVAL_MINUTES', 10) * 60_000,
    },
    clamHost: env.CLAMD_HOST || '127.0.0.1',
    clamPort: integer('CLAMD_PORT', 3310),
    uploadLimit: integer('UPLOADS_PER_HOUR', 10),
    storageQuota: integer('STORAGE_QUOTA_BYTES', 20 * 1024 ** 3),
    dailyQuota: integer('DAILY_UPLOAD_QUOTA_BYTES', 10 * 1024 ** 3),
    trustProxy: env.TRUST_PROXY_CIDRS ? env.TRUST_PROXY_CIDRS.split(',') : false,
    frontendRoot:
      env.FRONTEND_ROOT || fileURLToPath(new URL('../../frontend/dist/', import.meta.url)),
  };
}
