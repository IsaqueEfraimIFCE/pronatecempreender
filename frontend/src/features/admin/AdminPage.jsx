import { useEffect, useState } from 'react';
import { INSTITUTIONS } from '@pronatec/shared';
import { api } from '../../services/intakeClient';
import '../../components/intake/Intake.css';
import { LegacyImport } from './LegacyImport';
export function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reports, setReports] = useState([]),
    [groups, setGroups] = useState([]),
    [filters, setFilters] = useState({ institution: '', status: '' }),
    [offset, setOffset] = useState(0),
    [groupOffset, setGroupOffset] = useState(0),
    [next, setNext] = useState(null);
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  ).toString();
  useEffect(() => {
    api('/admin/session')
      .then(() => setAuthenticated(true))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let disposed = false;
    Promise.all([
      api(`/admin/reports?${query}&offset=${offset}`),
      api(`/admin/registrations?offset=${groupOffset}`),
    ])
      .then(([r, g]) => {
        if (!disposed) {
          setReports(r.rows);
          setNext(r.nextOffset);
          setGroups(g.rows);
          setError('');
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [authenticated, query, offset, groupOffset]);
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/login', { method: 'POST', body: { password } });
      setPassword('');
      setAuthenticated(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!authenticated)
    return (
      <section className="intake-panel">
        <h2>Administração</h2>
        <p>Acesso restrito aos relatórios e dados dos participantes.</p>
        <form onSubmit={login}>
          <label>
            Senha administrativa
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          {error && (
            <p className="intake-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy}>Entrar</button>
        </form>
      </section>
    );
  return (
    <>
      <section className="intake-panel">
        <div className="intake-actions">
          <button
            className="secondary"
            onClick={async () => {
              try {
                await api('/admin/logout', { method: 'POST' });
                setAuthenticated(false);
                setReports([]);
                setGroups([]);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Sair
          </button>
        </div>
        <h2>Relatórios da turma</h2>
        <div className="intake-grid">
          <label>
            Instituição
            <select
              value={filters.institution}
              onChange={(e) => {
                setFilters({ ...filters, institution: e.target.value });
                setOffset(0);
              }}
            >
              <option value="">Todas</option>
              {INSTITUTIONS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters({ ...filters, status: e.target.value });
                setOffset(0);
              }}
            >
              <option value="">Todos</option>
              {[
                'initializing',
                'uploading',
                'validating',
                'received',
                'rejected',
                'expired',
                'failed',
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <a className="intake-link" href={`/api/admin/reports.csv?${query}`}>
          Exportar CSV
        </a>
        {error && (
          <p role="alert" className="intake-error">
            {error}
          </p>
        )}
        <div className="intake-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recebimento</th>
                <th>Turma</th>
                <th>Arquivo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                    <br />
                    <small>{r.id}</small>
                  </td>
                  <td>
                    {r.metadata.institution} · {r.metadata.campus}
                    <br />
                    {r.metadata.course}
                    <br />
                    {r.metadata.completionDate || 'Sem data de conclusão'}
                  </td>
                  <td>
                    {r.status === 'received' ? (
                      <a href={`/api/admin/reports/${r.id}/file`}>{r.metadata.originalName}</a>
                    ) : (
                      r.metadata.originalName
                    )}
                    <br />
                    {(Number(r.size_bytes) / 1024 ** 2).toFixed(2)} MiB
                  </td>
                  <td>
                    {r.status}
                    {r.error && <p>{r.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="intake-actions">
          <button
            className="secondary"
            disabled={!offset}
            onClick={() => setOffset((n) => Math.max(0, n - 50))}
          >
            Anterior
          </button>
          <button className="secondary" disabled={next === null} onClick={() => setOffset(next)}>
            Próxima
          </button>
        </div>
      </section>
      <section className="intake-panel">
        <h2>Cadastros de participantes</h2>
        <div className="intake-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Responsável / protocolo</th>
                <th>Turma</th>
                <th>Participantes</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.id}-${g.institution}-${g.campus}-${g.course}`}>
                  <td>
                    {g.responsible.name}
                    <br />
                    {g.responsible.email}
                    <br />
                    <small>{g.id}</small>
                    <br />
                    <a href={`/api/admin/participants.csv?batchId=${g.id}`}>
                      Exportar participantes do lote
                    </a>
                  </td>
                  <td>
                    {g.institution} · {g.campus}
                    <br />
                    {g.course}
                  </td>
                  <td>{g.participant_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="intake-actions">
          <button
            className="secondary"
            disabled={!groupOffset}
            onClick={() => setGroupOffset((n) => Math.max(0, n - 50))}
          >
            Anterior
          </button>
          <button
            className="secondary"
            disabled={groups.length < 50}
            onClick={() => setGroupOffset((n) => n + 50)}
          >
            Próxima
          </button>
        </div>
      </section>
      <LegacyImport />
    </>
  );
}
