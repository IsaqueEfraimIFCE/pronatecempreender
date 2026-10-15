import { useState } from 'react';
import {
  validateBatch,
  context,
  enrollmentKey,
  ROLES,
  MAX_PARTICIPANTS,
} from '@pronatec/shared';
import { ClassFields } from '../../components/intake/ClassFields';
import { Turnstile } from '../../components/intake/Turnstile';
import { api } from '../../services/intakeClient';
import { useParticipantDraft, emptyParticipant } from './useParticipantDraft';
import '../../components/intake/Intake.css';
export function ParticipantForm() {
  const { draft, setDraft, change, clear } = useParticipantDraft(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState(null),
    [token, setToken] = useState(''),
    [revision, setRevision] = useState(0);
  function add(event) {
    event.preventDefault();
    setError('');
    try {
      const p = validateBatch({
        responsible: { name: 'Validação', email: 'validation@example.invalid' },
        participants: [{ ...draft.context, ...draft.entry }],
      }).participants[0];
      if (
        draft.participants.some(
          (old, index) => index !== draft.editing && enrollmentKey(old) === enrollmentKey(p),
        )
      )
        throw new Error('Participante já incluído nesta turma.');
      const participants = [...draft.participants];
      if (draft.editing === null) {
        if (participants.length >= MAX_PARTICIPANTS)
          throw new Error('Limite de 1.000 participantes atingido.');
        participants.push(p);
      } else participants[draft.editing] = p;
      change({ participants, entry: emptyParticipant(), editing: null });
    } catch (e) {
      setError(e.message);
    }
  }
  function review() {
    setError('');
    try {
      if (
        draft.editing !== null ||
        ['name', 'cpf', 'email', 'city'].some((key) => draft.entry[key].trim())
      )
        throw new Error('Adicione ou descarte o participante em edição antes da revisão.');
      if (Object.values(draft.context).some(Boolean))
        throw new Error('Conclua o campus / curso aberto antes da revisão.');
      validateBatch(draft);
      setDraft((old) => ({ ...old, review: true }));
    } catch (e) {
      setError(e.message);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const payload = validateBatch(draft);
      const result = await api('/registrations', {
        method: 'POST',
        body: { ...payload, id: draft.id, captchaToken: token },
      });
      setReceipt(result);
      clear();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setRevision((n) => n + 1);
    }
  }
  if (receipt)
    return (
      <section className="intake-panel intake-success">
        <h2>Cadastro finalizado</h2>
        <p>{receipt.count} participantes recebidos.</p>
        <p className="intake-protocol">Protocolo: {receipt.id}</p>
        <button onClick={() => setReceipt(null)}>Novo cadastro</button>
      </section>
    );
  return (
    <section className="intake-panel">
      <h2>Cadastro de participantes</h2>
      <p>
        Inclua estudantes e docentes, confira os dados e envie o lote. Você pode cadastrar
        diferentes campi e cursos no mesmo envio.
      </p>
      <p className="intake-muted">
        O rascunho fica restrito a esta aba e expira após 24 horas sem uso. Use “Limpar rascunho” ao
        terminar em um computador compartilhado.
      </p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        <div className="intake-grid">
          <label>
            Nome do responsável
            <input
              value={draft.responsible.name}
              maxLength={160}
              onChange={(e) =>
                change({ responsible: { ...draft.responsible, name: e.target.value } })
              }
              required
            />
          </label>
          <label>
            E-mail do responsável
            <input
              type="email"
              value={draft.responsible.email}
              maxLength={200}
              onChange={(e) =>
                change({ responsible: { ...draft.responsible, email: e.target.value } })
              }
              required
            />
          </label>
        </div>
        {!draft.review && (
          <form onSubmit={add}>
            <ClassFields
              value={draft.context}
              onChange={(value) => change({ context: value })}
              prefix="participant"
            />
            <div className="intake-grid">
              {[
                ['name', 'Nome completo', 'text', 160],
                ['cpf', 'CPF', 'text', 20],
                ['email', 'E-mail', 'email', 200],
                ['city', 'Cidade', 'text', 120],
              ].map(([key, label, type, maxLength]) => (
                <label key={key}>
                  {label}
                  <input
                    type={type}
                    value={draft.entry[key]}
                    maxLength={maxLength}
                    onChange={(e) => change({ entry: { ...draft.entry, [key]: e.target.value } })}
                    required
                  />
                </label>
              ))}
              <label>
                Vínculo
                <select
                  value={draft.entry.link}
                  onChange={(e) => change({ entry: { ...draft.entry, link: e.target.value } })}
                >
                  {ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="intake-actions">
              <button type="submit">
                {draft.editing === null ? 'Adicionar participante' : 'Salvar edição'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => change({ entry: emptyParticipant(), editing: null })}
              >
                Descartar edição
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  try {
                    context(draft.context);
                    if (
                      draft.editing !== null ||
                      ['name', 'cpf', 'email', 'city'].some((k) => draft.entry[k].trim())
                    )
                      throw new Error('Conclua o participante em edição primeiro.');
                    change({ context: {} });
                    setError('');
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Concluir campus / curso
              </button>
            </div>
          </form>
        )}
        <h3>
          {draft.review ? 'Revise antes de enviar' : 'Participantes incluídos'} (
          {draft.participants.length})
        </h3>
        <div className="intake-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Participante</th>
                <th>Turma</th>
                <th>Vínculo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {draft.participants.map((p, index) => (
                <tr key={enrollmentKey(p)}>
                  <td>
                    {p.name}
                    <br />
                    <span className="intake-muted">
                      {p.cpf} · {p.email}
                      <br />
                      {p.city}
                    </span>
                  </td>
                  <td>
                    {p.institution} · {p.campus}
                    <br />
                    {p.course}
                  </td>
                  <td>{p.link}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        change({
                          entry: {
                            name: p.name,
                            cpf: p.cpf,
                            email: p.email,
                            city: p.city,
                            link: p.link,
                          },
                          context: {
                            institution: p.institution,
                            campus: p.campus,
                            course: p.course,
                          },
                          editing: index,
                        })
                      }
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        change({
                          participants: draft.participants.filter((_, i) => i !== index),
                          entry: emptyParticipant(),
                          editing: null,
                        })
                      }
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <p className="intake-error" role="alert">
            {error}
          </p>
        )}
        {draft.review && <Turnstile revision={revision} onToken={setToken} />}
        <div className="intake-actions">
          {draft.review ? (
            <>
              <button type="button" onClick={submit} disabled={busy}>
                {busy ? 'Enviando…' : 'Confirmar envio'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setDraft((old) => ({ ...old, review: false }))}
              >
                Voltar
              </button>
            </>
          ) : (
            <button type="button" onClick={review} disabled={!draft.participants.length}>
              Revisar cadastro
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (window.confirm('Descartar todo o rascunho?')) {
                clear();
                setError('');
              }
            }}
          >
            Limpar rascunho
          </button>
        </div>
      </fieldset>
    </section>
  );
}
