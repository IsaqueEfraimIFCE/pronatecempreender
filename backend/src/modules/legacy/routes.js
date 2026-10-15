import { accessKeyMatches, adminGuard, clientIp, keyed, rateLimit } from '../../security.js';
import { legacyService } from './service.js';
import { createSheetsClient } from './sheets.js';
import { createSyncService } from './sync.js';

// Replacements for the Apps Script web apps: public CPF consultation plus the
// SETEC and Coordenação dashboards (by access code or admin session), the CSV
// import and the Google Sheets synchronisation controls.
export function legacyRoutes(app, { pool, config }) {
  const service = legacyService(pool, config);
  const sync = createSyncService({
    pool,
    config,
    legacy: service,
    client: config.sync.enabled ? createSheetsClient(config.sync) : null,
  });
  const guard = adminGuard(pool);
  app.post('/api/legacy/cpf', (request) => service.lookup(request.body, clientIp(request, config)));
  app.get('/api/admin/legacy/setec-summary', { preHandler: guard }, async () => ({
    summary: await service.setecSummary(),
  }));
  app.get('/api/admin/legacy/coordination-summary', { preHandler: guard }, async () => ({
    summary: await service.coordinationSummary(),
  }));
  // Original behaviour: paste the shared access code on the page to load a dashboard.
  const codeGuard = async (request) => {
    await rateLimit(pool, `dashkey:${keyed(config, clientIp(request, config))}`, 10, 900);
    if (!accessKeyMatches(config, request.body?.accessKey)) {
      const error = new Error('Código de acesso inválido.');
      error.statusCode = 401;
      throw error;
    }
  };
  app.post('/api/legacy/setec-summary', { preHandler: codeGuard }, async () => ({
    summary: await service.setecSummary(),
  }));
  app.post('/api/legacy/coordination-summary', { preHandler: codeGuard }, async () => ({
    summary: await service.coordinationSummary(),
  }));
  app.get('/api/admin/legacy/status', { preHandler: guard }, () => service.status());
  app.post('/api/admin/legacy/import', { preHandler: guard }, (request) =>
    service.importCsv(request.body || {}),
  );
  app.get('/api/admin/legacy/sync', { preHandler: guard }, () => sync.report());
  app.post('/api/admin/legacy/sync', { preHandler: guard }, async (request) => {
    if (!sync.enabled)
      throw Object.assign(new Error('A sincronização automática não está configurada.'), {
        statusCode: 409,
      });
    await rateLimit(pool, `sync:${keyed(config, clientIp(request, config))}`, 6, 900);
    return sync.runAll({ force: true });
  });
}
