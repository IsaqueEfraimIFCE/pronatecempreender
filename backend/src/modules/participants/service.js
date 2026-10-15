import { validateBatch, enrollmentKey, InputError } from '@pronatec/shared';
import { transaction } from '../../db/pool.js';
import { captcha, digest, keyed, uuid, rateLimit } from '../../security.js';

export function participantService(pool, config) {
  async function receipt(id, hash) {
    const previous = (
      await pool.query(
        'SELECT request_hash,participant_count FROM registration_batches WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!previous) return null;
    if (previous.request_hash !== hash)
      throw new InputError('Este protocolo já foi usado com outros dados.');
    return { id, count: previous.participant_count, status: 'Finalizado' };
  }
  return {
    async submit(input, ip) {
      const id = uuid(input.id),
        batch = validateBatch(input),
        hash = digest(JSON.stringify(batch));
      const previous = await receipt(id, hash);
      if (previous) return previous;
      await rateLimit(pool, `registration:${keyed(config, ip)}`, 20);
      await captcha(config, input.captchaToken);
      try {
        await transaction(pool, async (client) => {
          await client.query(
            'INSERT INTO registration_batches(id,request_hash,responsible,participant_count) VALUES($1,$2,$3,$4)',
            [id, hash, batch.responsible, batch.participants.length],
          );
          const groups = new Map();
          for (const p of batch.participants) {
            await client.query(
              'INSERT INTO enrollments(batch_id,institution,campus,course,name,cpf,email,city,role,identity_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
              [
                id,
                p.institution,
                p.campus,
                p.course,
                p.name,
                p.cpf,
                p.email,
                p.city,
                p.link,
                keyed(config, enrollmentKey(p)),
              ],
            );
            const groupKey = JSON.stringify([p.institution, p.campus, p.course]);
            const group = groups.get(groupKey) || { ...p, count: 0 };
            group.count++;
            groups.set(groupKey, group);
          }
          for (const g of groups.values())
            await client.query(
              'INSERT INTO registration_groups(batch_id,institution,campus,course,participant_count) VALUES($1,$2,$3,$4,$5)',
              [id, g.institution, g.campus, g.course, g.count],
            );
        });
      } catch (error) {
        if (error.code !== '23505') throw error;
        const retried = await receipt(id, hash);
        if (retried) return retried;
        throw Object.assign(
          new Error(
            'Há participantes já cadastrados nesta instituição, campus e curso. Nenhum registro do lote foi salvo.',
          ),
          { statusCode: 409 },
        );
      }
      return { id, count: batch.participants.length, status: 'Finalizado' };
    },
  };
}
