import { AlertCircle, Database, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import './DashboardCoordenacao.css';
import '../dashboard-setec/DashboardSetec.css';

import { DashboardSkeleton } from '../../components/dashboard/DashboardSkeleton';
import { StatePanel } from '../../components/feedback/StatePanel';
import { api } from '../../services/intakeClient';

import { SecondaryDashboardContent } from './SecondaryDashboardContent';
import { SecondaryDashboardSetup } from './SecondaryDashboardSetup';

// Paste the shared access code to load the aggregated indicators (as in the original
// portal). A signed-in administrator is let through without typing the code.
export function SecondaryDashboard() {
  const [accessKey, setAccessKey] = useState('');
  const [status, setStatus] = useState('idle');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    api('/admin/legacy/coordination-summary')
      .then((payload) => {
        if (disposed) return;
        setSummary(payload.summary);
        setStatus('ready');
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!accessKey.trim()) {
      setError('Informe o código de acesso.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError('');

    try {
      const payload = await api('/legacy/coordination-summary', {
        method: 'POST',
        body: { accessKey: accessKey.trim() },
      });
      setSummary(payload.summary);
      setStatus('ready');
    } catch (requestError) {
      setError(requestError.message);
      setStatus('error');
    }
  }

  return (
    <div className="dashboard-layout">
      <form className="panel admin-panel" onSubmit={handleSubmit}>
        <label htmlFor="secondary-access-key">Chave administrativa</label>

        <div className="input-row">
          <input
            id="secondary-access-key"
            type="password"
            autoComplete="off"
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
            placeholder="Cole o código de acesso do dashboard"
          />

          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? (
              <Loader2 className="spin" size={18} aria-hidden="true" />
            ) : (
              <Database size={18} aria-hidden="true" />
            )}
            Carregar
          </button>
        </div>

        <p>
          Este painel apresenta dados agregados sobre os institutos cadastrados, ajudando a
          coordenação a acompanhar vagas, cursos, regiões e cronograma do programa.
        </p>
      </form>

      {status === 'idle' ? <SecondaryDashboardSetup /> : null}
      {status === 'loading' ? <DashboardSkeleton /> : null}

      {status === 'error' ? (
        <StatePanel
          tone="danger"
          icon={AlertCircle}
          title="Dashboard indisponível"
          text={error}
          assertive
        />
      ) : null}

      {status === 'ready' && summary ? <SecondaryDashboardContent summary={summary} /> : null}
    </div>
  );
}
