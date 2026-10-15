import { participantService } from './service.js';
import { clientIp } from '../../security.js';
export function participantRoutes(app, { pool, config }) {
  const service = participantService(pool, config);
  app.post('/api/registrations', (request) => service.submit(request.body, clientIp(request, config)));
}
