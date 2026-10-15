import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import serveStatic from '@fastify/static';
import { INSTITUTIONS, COURSES, EXTENSIONS, MAX_BYTES, PART_BYTES } from '@pronatec/shared';
import { reportRoutes } from './modules/reports/routes.js';
import { participantRoutes } from './modules/participants/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { legacyRoutes } from './modules/legacy/routes.js';
import { rateLimit, keyed, clientIp } from './security.js';

export async function createApp(dependencies, { staticFiles = true, logger = true } = {}) {
  const { config, pool, storage } = dependencies;
  const app = Fastify({
    logger,
    disableRequestLogging: true,
    bodyLimit: 4 * 1024 ** 2,
    trustProxy: config.trustProxy,
    requestTimeout: 60000,
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        connectSrc: [
          "'self'",
          config.s3.signingEndpoint || config.s3.endpoint,
          'https://challenges.cloudflare.com',
        ],
        frameSrc: ['https://challenges.cloudflare.com'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
  });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (request.url.startsWith('/api/'))
      await rateLimit(pool, `api:${keyed(config, clientIp(request, config))}`, 240, 60);
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      ((request.headers.origin && request.headers.origin !== config.origin) ||
        request.headers['sec-fetch-site'] === 'cross-site')
    ) {
      return reply.code(403).send({ message: 'Origem da solicitação não permitida.' });
    }
  });
  app.addHook('preValidation', async (request, reply) => {
    if (
      request.method === 'POST' &&
      ['/api/reports', '/api/registrations', '/api/admin/login', '/api/legacy/cpf'].includes(
        request.url,
      ) &&
      (!request.body || typeof request.body !== 'object' || Array.isArray(request.body))
    )
      return reply.code(400).send({ message: 'Informe os dados do formulário.' });
  });
  app.setErrorHandler((error, request, reply) => {
    const status =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    if (status === 500)
      app.log.error({ requestId: request.id, errorType: error.name }, 'Request failed');
    reply.code(status).send({
      message: status === 500 ? 'Não foi possível concluir. Tente novamente.' : error.message,
    });
  });
  app.get('/api/catalogs', async () => ({
    institutions: INSTITUTIONS,
    courses: COURSES,
    extensions: EXTENSIONS,
    maxBytes: MAX_BYTES,
    partBytes: PART_BYTES,
    siteKey: config.captchaSiteKey || null,
  }));
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (request, reply) => {
    try {
      await pool.query('SELECT 1');
      await storage.ready();
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  reportRoutes(app, dependencies);
  participantRoutes(app, dependencies);
  adminRoutes(app, dependencies);
  legacyRoutes(app, dependencies);
  if (staticFiles) {
    await app.register(serveStatic, { root: config.frontendRoot, prefix: '/' });
    app.setNotFoundHandler((request, reply) =>
      request.method === 'GET' && !request.url.startsWith('/api/')
        ? reply.sendFile('index.html')
        : reply.code(404).send({ message: 'Não encontrado.' }),
    );
  }
  return app;
}
