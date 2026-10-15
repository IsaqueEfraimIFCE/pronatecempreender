import { AlertCircle, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';

import { FORM_URL } from '../../../config/env';
import { StatePanel } from '../../../components/feedback/StatePanel';

export function CpfResult({ status, result, error }) {
  if (status === 'idle') {
    return null;
  }

  if (status === 'loading') {
    return (
      <StatePanel
        tone="neutral"
        icon={Loader2}
        title="Consultando"
        text="Estamos verificando a base de respostas."
        spinning
      />
    );
  }

  if (status === 'found' && result?.data) {
    return (
      <section className="result-panel success" aria-live="polite">
        <CheckCircle2 size={24} aria-hidden="true" />
        <div>
          <h2>Registro encontrado</h2>
          <dl>
            <div>
              <dt>Nome</dt>
              <dd>{result.data.name}</dd>
            </div>
            <div>
              <dt>Curso escolhido</dt>
              <dd>{result.data.course}</dd>
            </div>
          </dl>
        </div>
      </section>
    );
  }

  if (status === 'notFound') {
    return (
      <section className="result-panel warning" aria-live="polite">
        <XCircle size={24} aria-hidden="true" />
        <div>
          <h2>CPF não encontrado</h2>
          <p>Não localizamos uma resposta para este CPF. Responda o formulário para registrar suas informações.</p>
          <a className="link-button" href={result?.formUrl || FORM_URL} target="_blank" rel="noreferrer">
            Abrir formulário
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        </div>
      </section>
    );
  }

  return <StatePanel tone="danger" icon={AlertCircle} title="Consulta indisponível" text={error} assertive />;
}