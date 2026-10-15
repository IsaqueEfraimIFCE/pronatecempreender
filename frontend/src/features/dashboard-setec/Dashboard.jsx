import { AlertCircle, BarChart3, Gauge, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import './DashboardSetec.css';

import { DashboardSkeleton } from '../../components/dashboard/DashboardSkeleton';
import { StatePanel } from '../../components/feedback/StatePanel';
import { api } from '../../services/intakeClient';

import { DashboardContent } from './DashboardContent';

// Paste the shared access code to load the aggregated indicators (as in the original
// portal). A signed-in administrator is let through without typing the code.
export function Dashboard() {
  const [accessKey, setAccessKey] = useState('');
  const [status, setStatus] = useState('idle');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    api('/admin/legacy/setec-summary')
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
      const payload = await api('/legacy/setec-summary', {
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
        <label htmlFor="access-key">Chave administrativa</label>

        <div className="input-row">
          <input
            id="access-key"
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
              <BarChart3 size={18} aria-hidden="true" />
            )}
            Carregar
          </button>
        </div>

        <p>O dashboard usa apenas dados agregados das respostas.</p>
      </form>

      {status === 'idle' ? (
        <StatePanel
          tone="neutral"
          icon={Gauge}
          title="Pronto para carregar"
          text="Informe a chave administrativa para buscar os indicadores."
        />
      ) : null}

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

      {status === 'ready' && summary ? <DashboardContent summary={summary} /> : null}
    </div>
  );
}
