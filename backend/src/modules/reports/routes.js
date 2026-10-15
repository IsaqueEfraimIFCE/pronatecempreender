import { reportService } from './service.js';
import { clientIp } from '../../security.js';
export function reportRoutes(app, dependencies) {
  const service = reportService(dependencies.pool, dependencies.storage, dependencies.config);
  app.post('/api/reports', (request) => service.initialize(request.body, clientIp(request, dependencies.config)));
  app.get('/api/reports/:id', (request) =>
    service.status(request.params.id, request.headers['x-upload-secret']),
  );
  app.post('/api/reports/:id/parts/:number', (request) =>
    service.sign(
      request.params.id,
      request.headers['x-upload-secret'],
      Number(request.params.number),
    ),
  );
  app.post('/api/reports/:id/complete', (request) =>
    service.complete(request.params.id, request.headers['x-upload-secret']),
  );
}
