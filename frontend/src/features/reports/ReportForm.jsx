import { useState } from 'react';
import { ClassFields } from '../../components/intake/ClassFields';
import { Turnstile } from '../../components/intake/Turnstile';
import { useReportUpload } from './useReportUpload';
import { EXTENSIONS, MAX_BYTES, todayInSaoPaulo } from '@pronatec/shared';
import '../../components/intake/Intake.css';
export function ReportForm() {
  const upload = useReportUpload(),
    [fields, setFields] = useState(upload.session?.metadata || {}),
    [file, setFile] = useState(null),
    [token, setToken] = useState(''),
    [revision, setRevision] = useState(0);
  async function submit(event) {
    event.preventDefault();
    await upload.upload(fields, file, token);
    setRevision((n) => n + 1);
  }
  return (
    <section className="intake-panel">
      <h2>Enviar relatório da turma</h2>
      <p>
        Envio anônimo. Os documentos ficam privados e são acessíveis somente à administração
        autorizada.
      </p>
      {upload.session && (
        <p className="intake-muted">
          Envio salvo por até 24 horas neste navegador. Selecione novamente o arquivo original para
          retomar.
          <br />
          Protocolo: <span className="intake-protocol">{upload.session.id}</span>
        </p>
      )}
      <form onSubmit={submit}>
        <ClassFields
          value={fields}
          onChange={setFields}
          disabled={upload.busy || Boolean(upload.session)}
          prefix="report"
        />
        <label>
          Data de conclusão (opcional)
          <input
            type="date"
            min="2020-01-01"
            max={todayInSaoPaulo()}
            value={fields.completionDate || ''}
            onChange={(e) => setFields({ ...fields, completionDate: e.target.value })}
            disabled={upload.busy || Boolean(upload.session)}
          />
        </label>
        <label>
          Arquivo do relatório
          <input
            type="file"
            accept={EXTENSIONS.map((x) => `.${x}`).join(',')}
            onChange={(e) => setFile(e.target.files[0] || null)}
            disabled={upload.busy}
            required={!file}
          />
        </label>
        <p className="intake-muted">
          PDF, DOCX, PPTX, DOC, PPT, ODT ou ODP. Até {MAX_BYTES / 1024 ** 2} MiB. Documentos com
          macros ou criptografia são rejeitados.
        </p>
        <Turnstile onToken={setToken} revision={revision} />
        {upload.error && (
          <p className="intake-error" role="alert">
            {upload.error}
          </p>
        )}
        {upload.status && (
          <p role="status" aria-live="polite">
            {upload.status}
          </p>
        )}
        {(upload.busy || upload.progress > 0) && (
          <progress max="100" value={upload.progress} aria-label="Progresso do upload" />
        )}
        <div className="intake-actions">
          <button disabled={upload.busy} type="submit">
            {upload.session ? 'Retomar / consultar envio' : 'Enviar relatório'}
          </button>
          {upload.busy && (
            <button type="button" className="secondary" onClick={upload.pause}>
              Pausar
            </button>
          )}
          {upload.session && !upload.busy && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                upload.forget();
                setFields({});
                setFile(null);
              }}
            >
              Novo envio
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
