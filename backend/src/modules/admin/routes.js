import { adminGuard, login, rateLimit, keyed, digest, uuid, clientIp } from '../../security.js';
import { csv } from './csv.js';
import { INSTITUTIONS, InputError } from '@pronatec/shared';

export function adminRoutes(app, { pool, storage, config }) {
  const guard = adminGuard(pool);
  const cookieOptions = {
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict',
    path: '/api/admin',
    maxAge: 8 * 3600,
  };
  app.post('/api/admin/login', async (request, reply) => {
    await rateLimit(pool, `login:${keyed(config, clientIp(request, config))}`, 8, 900);
    const token = await login(pool, config, request.body?.password);
    reply.setCookie('pronatec_admin', token, cookieOptions);
    return { authenticated: true };
  });
  app.post('/api/admin/logout', { preHandler: guard }, async (request, reply) => {
    await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1', [
      digest(request.cookies.pronatec_admin),
    ]);
    reply.clearCookie('pronatec_admin', { path: '/api/admin' });
    return { authenticated: false };
  });
  app.get('/api/admin/session', { preHandler: guard }, async () => ({ authenticated: true }));
  function filters(query) {
    const conditions = [],
      values = [];
    const add = (expression, value) => {
      values.push(value);
      conditions.push(`${expression}=$${values.length}`);
    };
    if (query.institution) {
      if (!INSTITUTIONS.includes(query.institution)) throw new InputError('Instituição inválida.');
      add("metadata->>'institution'", query.institution);
    }
    if (query.status) {
      if (
        ![
          'initializing',
          'uploading',
          'validating',
          'received',
          'rejected',
          'expired',
          'failed',
        ].includes(query.status)
      )
        throw new InputError('Status inválido.');
      add('status', query.status);
    }
    return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
  }
  app.get('/api/admin/reports', { preHandler: guard }, async (request) => {
    const { where, values } = filters(request.query),
      offset = Number(request.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new InputError('Página inválida.');
    const result = await pool.query(
      `SELECT id,metadata,status,size_bytes,created_at,received_at,error FROM reports ${where} ORDER BY created_at DESC LIMIT 50 OFFSET $${values.length + 1}`,
      [...values, offset],
    );
    return {
      rows: result.rows,
      offset,
      nextOffset: result.rows.length === 50 ? offset + 50 : null,
    };
  });
  app.get('/api/admin/reports.csv', { preHandler: guard }, async (request, reply) => {
    const { where, values } = filters(request.query);
    const rows = (
      await pool.query(
        `SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT 10001`,
        values,
      )
    ).rows;
    if (rows.length > 10000)
      throw new InputError('Selecione filtros para exportar até 10.000 envios por vez.');
    await pool.query("INSERT INTO audit_events(action) VALUES('report_export')");
    return reply
      .header('content-disposition', 'attachment; filename="relatorios.csv"')
      .type('text/csv; charset=utf-8')
      .send(
        csv([
          [
            'Data/Hora',
            'ID',
            'Link privado',
            'Instituição',
            'Campus',
            'Curso',
            'Data de conclusão',
            'Arquivo',
            'Tamanho (MiB)',
            'Status',
          ],
          ...rows.map((r) => [
            r.created_at.toISOString(),
            r.id,
            `${config.origin}/api/admin/reports/${r.id}/file`,
            r.metadata.institution,
            r.metadata.campus,
            r.metadata.course,
            r.metadata.completionDate,
            r.metadata.originalName,
            (Number(r.size_bytes) / 1024 ** 2).toFixed(3),
            r.status,
          ]),
        ]),
      );
  });
  app.get('/api/admin/reports/:id/file', { preHandler: guard }, async (request, reply) => {
    const id = uuid(request.params.id),
      row = (
        await pool.query(
          "SELECT object_key,metadata FROM reports WHERE id=$1 AND status='received'",
          [id],
        )
      ).rows[0];
    if (!row) return reply.code(404).send({ message: 'Arquivo não disponível.' });
    await pool.query("INSERT INTO audit_events(action,object_id) VALUES('report_download',$1)", [
      id,
    ]);
    return reply.redirect(await storage.download(row.object_key, row.metadata.originalName));
  });
  app.get('/api/admin/registrations', { preHandler: guard }, async (request) => {
    const offset = Number(request.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new InputError('Página inválida.');
    return {
      rows: (
        await pool.query(
          'SELECT b.id,b.created_at,b.responsible,g.institution,g.campus,g.course,g.participant_count FROM registration_batches b JOIN registration_groups g ON b.id=g.batch_id ORDER BY b.created_at DESC,g.id LIMIT 50 OFFSET $1',
          [offset],
        )
      ).rows,
      offset,
    };
  });
  app.get('/api/admin/participants.csv', { preHandler: guard }, async (request, reply) => {
    const id = uuid(request.query.batchId);
    const rows = (
      await pool.query(
        'SELECT e.*,b.responsible,b.created_at FROM enrollments e JOIN registration_batches b ON b.id=e.batch_id WHERE batch_id=$1 ORDER BY e.id',
        [id],
      )
    ).rows;
    await pool.query("INSERT INTO audit_events(action,object_id) VALUES('participant_export',$1)", [
      id,
    ]);
    return reply
      .header('content-disposition', 'attachment; filename="participantes.csv"')
      .type('text/csv; charset=utf-8')
      .send(
        csv([
          [
            'Data/Hora',
            'ID',
            'Responsável',
            'E-mail responsável',
            'Nome',
            'Sobrenome',
            'CPF',
            'E-mail',
            'Cidade',
            'Instituição',
            'Campus',
            'Curso',
            'Vínculo',
            'Status',
          ],
          ...rows.map((p) => [
            p.created_at.toISOString(),
            p.batch_id,
            p.responsible.name,
            p.responsible.email,
            p.name.split(' ')[0],
            p.name.split(' ').slice(1).join(' '),
            p.cpf,
            p.email,
            p.city,
            p.institution,
            p.campus,
            p.course,
            p.role,
            'Finalizado',
          ]),
        ]),
      );
  });
}
