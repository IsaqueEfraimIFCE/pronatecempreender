import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const deriveKey = promisify(scrypt);
import { InputError } from '@pronatec/shared';
import { isIP } from 'node:net';
export function clientIp(request, config) {
  // Enabled only on Fly HTTP services, where Fly Proxy overwrites this header.
  // Never use user-supplied X-Forwarded-For as an identity.
  const forwarded = request.headers['fly-client-ip'];
  return config.useFlyClientIp && typeof forwarded === 'string' && isIP(forwarded)
    ? forwarded : request.ip;
}
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const keyed = (config, value) =>
  createHmac('sha256', config.securityKey).update(value).digest('hex');
export function secureEqual(a, b) {
  const x = Buffer.from(a || '');
  const y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}
// Shared dashboard access code (the original portal's "chave administrativa").
// Compared as digests so length differences do not leak through timing.
export function accessKeyMatches(config, candidate) {
  if (!config.dashboardKey || typeof candidate !== 'string' || candidate.length > 200) return false;
  return secureEqual(digest(candidate.trim()), digest(config.dashboardKey));
}
export function uuid(value) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || ''))
    throw new InputError('Identificador de envio inválido.');
  return value.toLowerCase();
}
export function resumeSecret(value) {
  if (!/^[a-f0-9]{64}$/.test(value || '')) throw new InputError('Sessão de envio inválida.');
  return value;
}
export async function passwordMatches(password, encoded) {
  try {
    const [kind, salt, hash] = encoded.split(':');
    if (kind !== 'scrypt' || typeof password !== 'string' || password.length > 200) return false;
    return secureEqual((await deriveKey(password, salt, 64)).toString('hex'), hash);
  } catch {
    return false;
  }
}
export async function rateLimit(pool, key, limit, seconds = 3600) {
  const window = Math.floor(Date.now() / 1000 / seconds);
  const { rows } = await pool.query(
    "INSERT INTO rate_windows(key,window_id,count,expires_at) VALUES($1,$2,1,now()+($3::text||' seconds')::interval) ON CONFLICT(key,window_id) DO UPDATE SET count=rate_windows.count+1 RETURNING count",
    [key, window, seconds * 2],
  );
  if (rows[0].count > limit) {
    const error = new Error('Limite de solicitações atingido. Aguarde e tente novamente.');
    error.statusCode = 429;
    throw error;
  }
}
export async function captcha(config, token) {
  if (config.bypass) return;
  if (typeof token !== 'string' || !token || token.length > 2048)
    throw new InputError('Conclua a verificação de segurança.');
  let response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: config.captchaSecret, response: token }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new InputError('Verificação indisponível. Tente novamente.');
  }
  if (!response.ok) throw new InputError('Verificação indisponível.');
  const result = await response.json();
  if (!result.success || result.hostname !== new URL(config.origin).hostname)
    throw new InputError('Verificação expirada ou inválida. Tente novamente.');
}
export function adminGuard(pool) {
  return async (request) => {
    const token = request.cookies?.pronatec_admin;
    if (
      !token ||
      !(
        await pool.query('SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()', [
          digest(token),
        ])
      ).rowCount
    ) {
      const error = new Error('Entre para acessar a administração.');
      error.statusCode = 401;
      throw error;
    }
  };
}
export async function login(pool, config, password) {
  if (!(await passwordMatches(password, config.adminHash))) {
    const error = new Error('Credenciais inválidas.');
    error.statusCode = 401;
    throw error;
  }
  const token = randomBytes(32).toString('hex');
  await pool.query(
    "INSERT INTO admin_sessions(token_hash,expires_at) VALUES($1,now()+interval '8 hours')",
    [digest(token)],
  );
  return token;
}
