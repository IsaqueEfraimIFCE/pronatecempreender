import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';

import './CpfValidator.css';

import { Turnstile } from '../../components/intake/Turnstile';
import { api } from '../../services/intakeClient';
import { formatCpf, onlyDigits } from '../../utils/cpf';

import { CpfResult } from './components/CpfResult';

export function CpfValidator() {
  const [cpf, setCpf] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaRevision, setCaptchaRevision] = useState(0);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const digits = useMemo(() => onlyDigits(cpf), [cpf]);
  const canSubmit = digits.length === 11 && Boolean(captchaToken) && status !== 'loading';

  function resetResult() {
    setResult(null);
    setError('');
    if (status !== 'loading') setStatus('idle');
  }

  function handleCpfChange(event) {
    setCpf(formatCpf(event.target.value));
    resetResult();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus('loading');
    setError('');
    setResult(null);

    try {
      const payload = await api('/legacy/cpf', {
        method: 'POST',
        body: { cpf: digits, captchaToken },
      });
      setResult(payload);
      setStatus(payload.found ? 'found' : 'notFound');
    } catch (requestError) {
      setError(requestError.message);
      setStatus('error');
    } finally {
      setCaptchaToken('');
      setCaptchaRevision((current) => current + 1);
    }
  }

  return (
    <div className="single-column">
      <form className="panel form-panel" onSubmit={handleSubmit}>
        <label htmlFor="cpf">CPF</label>

        <div className="input-row">
          <input
            id="cpf"
            inputMode="numeric"
            autoComplete="off"
            value={cpf}
            onChange={handleCpfChange}
            placeholder="000.000.000-00"
            maxLength={14}
            aria-describedby="cpf-help"
          />

          <button type="submit" disabled={!canSubmit}>
            {status === 'loading' ? (
              <Loader2 className="spin" size={18} aria-hidden="true" />
            ) : (
              <Search size={18} aria-hidden="true" />
            )}
            Consultar
          </button>
        </div>

        <p id="cpf-help">Digite os 11 números do CPF. A pontuação é aplicada automaticamente.</p>

        <Turnstile revision={captchaRevision} onToken={setCaptchaToken} />
      </form>

      <CpfResult status={status} result={result} error={error} />
    </div>
  );
}
