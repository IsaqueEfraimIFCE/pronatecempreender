import { useEffect, useState } from 'react';
import { api } from '../../services/intakeClient';

const KINDS = [
  { value: 'interested', label: 'Interessados (respostas do formulário — consulta de CPF e SETEC)' },
  { value: 'offers', label: 'Ofertas dos institutos (dashboard Coordenação)' },
];
const SOURCE_LABELS = {
  interested: 'Respostas do formulário',
  offers: 'Ofertas dos institutos',
};
const STATUS_LABELS = {
  ok: 'Em dia',
  pending: 'Aguardando',
  rejected: 'Rejeitada (dados mantidos)',
  error: 'Erro (dados mantidos)',
};
const POLL_MS = 60_000;

const formatTime = (value) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
    : '—';

// Scheduled synchronisation with the Google Sheets (the sheets are the source of truth).
function SyncPanel() {
  const [sync, setSync] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () =>
    api('/admin/legacy/sync')
      .then(setSync)
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  async function syncNow() {
    setBusy(true);
    setError('');
    try {
      const outcome = await api('/admin/legacy/sync', { method: 'POST', body: {} });
      if (outcome.busy) setError('Outra sincronização já está em andamento. Tente em instantes.');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="intake-panel">
      <h2>Sincronização com as planilhas do Google</h2>
      {!sync ? (
        <p>{error || 'Carregando…'}</p>
      ) : !sync.enabled ? (
        <p>
          A sincronização automática não está configurada. Os dados só mudam por importação manual
          de CSV, abaixo.
        </p>
      ) : (
        <>
          <p>
            A planilha é a fonte de verdade: o sistema a consulta a cada {sync.intervalMinutes}{' '}
            minutos e substitui os dados quando algo muda. Se uma planilha vier vazia ou muito
            menor, os dados atuais são mantidos e o motivo aparece aqui.
          </p>
          <div className="intake-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Estado</th>
                  <th>Última verificação</th>
                  <th>Última atualização</th>
                  <th>Linhas na planilha</th>
                  <th>Linhas no banco</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {sync.sources.map((item) => (
                  <tr key={item.source}>
                    <td>{SOURCE_LABELS[item.source] || item.source}</td>
                    <td>
                      {item.status === 'ok' && !item.inSync
                        ? 'Divergente (será refeita)'
                        : STATUS_LABELS[item.status] || item.status}
                    </td>
                    <td>{formatTime(item.lastCheckedAt)}</td>
                    <td>{formatTime(item.lastSyncedAt)}</td>
                    <td>{item.sheetRows ?? '—'}</td>
                    <td>{item.dbRows}</td>
                    <td>
                      {item.message ||
                        (item.unmapped?.length
                          ? `${item.unmapped.length} colunas ignoradas`
                          : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="intake-actions">
            <button disabled={busy} onClick={syncNow}>
              {busy ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
          </div>
        </>
      )}
      {error && sync && (
        <p role="alert" className="intake-error">
          {error}
        </p>
      )}
    </section>
  );
}

// Imports a CSV exported from the legacy Google Sheets into the portal database.
export function LegacyImport() {
  const [kind, setKind] = useState('interested');
  const [file, setFile] = useState(null);
  const [replace, setReplace] = useState(false);
  const [mapping, setMapping] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [counts, setCounts] = useState(null);

  const refresh = () =>
    api('/admin/legacy/status')
      .then(setCounts)
      .catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setReport(null);
    let parsedMapping;
    if (mapping.trim()) {
      try {
        parsedMapping = JSON.parse(mapping);
      } catch {
        setError('O mapeamento precisa ser um JSON válido, por exemplo {"Documento":"cpf"}.');
        return;
      }
    }
    if (!file) {
      setError('Escolha o arquivo CSV exportado da planilha.');
      return;
    }
    setBusy(true);
    try {
      const csv = await file.text();
      setReport(
        await api('/admin/legacy/import', {
          method: 'POST',
          body: { kind, csv, replace, mapping: parsedMapping },
        }),
      );
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SyncPanel />
      <section className="intake-panel">
        <h2>Importar dados das planilhas antigas (manual)</h2>
        <p>
          Alternativa à sincronização: exporte a planilha do Google como CSV e envie aqui. O CPF é
          guardado apenas como código irreversível; e-mails, telefones e demais dados de contato
          não são importados.
          {counts ? ` Hoje: ${counts.interested} interessados e ${counts.offers} ofertas.` : ''}
        </p>
        <form onSubmit={submit}>
          <label>
            Planilha
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Arquivo CSV
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0])} />
          </label>
          <label>
            Mapeamento de colunas (opcional, JSON)
            <input
              value={mapping}
              onChange={(e) => setMapping(e.target.value)}
              placeholder='{"Documento":"cpf","Pessoa":"name"}'
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />{' '}
            Substituir os dados existentes deste tipo
          </label>
          <div className="intake-actions">
            <button disabled={busy}>{busy ? 'Importando…' : 'Importar'}</button>
          </div>
        </form>
        {error && (
          <p role="alert" className="intake-error">
            {error}
          </p>
        )}
        {report && (
          <div role="status">
            <p>
              {report.inserted} novos, {report.duplicates} repetidos, {report.rows} linhas lidas.
            </p>
            {Object.keys(report.skipped).length > 0 && (
              <p>
                Ignoradas:{' '}
                {Object.entries(report.skipped)
                  .map(([reason, total]) => `${reason} (${total})`)
                  .join(', ')}
              </p>
            )}
            {report.unmapped.length > 0 && (
              <p>Colunas não reconhecidas (ignoradas): {report.unmapped.join(', ')}</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
