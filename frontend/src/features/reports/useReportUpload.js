import { useRef, useState } from 'react';
import { api, fingerprint, hex } from '../../services/intakeClient';
import { validateReport, PART_BYTES } from '@pronatec/shared';
const KEY = 'pronatec.report-upload.v1';
function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Date.now() - data.createdAt < 24 * 3600 * 1000) return data;
    localStorage.removeItem(KEY);
  } catch {}
  return null;
}
export function useReportUpload() {
  const [session, setSession] = useState(restore),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    controller = useRef(null);
  function forget() {
    localStorage.removeItem(KEY);
    setSession(null);
    setProgress(0);
    setStatus('');
    setError('');
  }
  async function upload(fields, file, captchaToken) {
    setError('');
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (!file) throw new Error('Selecione o arquivo original para enviar ou retomar.');
      validateReport({
        ...fields,
        originalName: file.name,
        size: file.size,
        fingerprint: '0'.repeat(64),
      });
      setStatus('Calculando identificação do arquivo…');
      const hash = await fingerprint(file);
      let current = session;
      if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (current) {
        if (current.metadata.fingerprint !== hash || current.metadata.size !== file.size)
          throw new Error('Selecione o mesmo arquivo usado neste envio.');
      } else {
        const metadata = validateReport({
          ...fields,
          originalName: file.name,
          size: file.size,
          fingerprint: hash,
        });
        current = {
          id: crypto.randomUUID(),
          secret: hex(crypto.getRandomValues(new Uint8Array(32))),
          metadata,
          createdAt: Date.now(),
        };
        localStorage.setItem(KEY, JSON.stringify(current));
        setSession(current);
      }
      await api('/reports', {
        method: 'POST',
        body: { ...current.metadata, id: current.id, secret: current.secret, captchaToken },
        signal: abort.signal,
      });
      const remote = await api(`/reports/${current.id}`, {
        secret: current.secret,
        signal: abort.signal,
      });
      if (['failed', 'expired', 'rejected'].includes(remote.status))
        throw new Error(remote.error || 'Envio indisponível. Inicie um novo envio.');
      if (remote.status === 'uploading') {
        const complete = new Map(remote.parts.map((p) => [p.number, p.size]));
        let sent = 0;
        for (let offset = 0, number = 1; offset < file.size; offset += PART_BYTES, number++) {
          const chunk = file.slice(offset, Math.min(offset + PART_BYTES, file.size));
          if (complete.get(number) !== chunk.size) {
            setStatus(`Enviando parte ${number} de ${Math.ceil(file.size / PART_BYTES)}…`);
            const { url } = await api(`/reports/${current.id}/parts/${number}`, {
              method: 'POST',
              secret: current.secret,
              signal: abort.signal,
            });
            const response = await fetch(url, { method: 'PUT', body: chunk, signal: abort.signal });
            if (!response.ok) throw new Error('Falha no envio da parte. Retome para continuar.');
          }
          sent += chunk.size;
          setProgress(Math.round((100 * sent) / file.size));
        }
        await api(`/reports/${current.id}/complete`, {
          method: 'POST',
          secret: current.secret,
          signal: abort.signal,
        });
      }
      setProgress(100);
      setStatus('Arquivo enviado. Aguardando verificação de segurança.');
      for (let attempts = 0; attempts < 40; attempts++) {
        const result = await api(`/reports/${current.id}`, {
          secret: current.secret,
          signal: abort.signal,
        });
        if (result.status === 'received') {
          setStatus('Relatório recebido e verificado.');
          return;
        }
        if (result.status === 'rejected') throw new Error(result.error || 'Arquivo rejeitado.');
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      }
      setStatus('Envio registrado. A verificação continua; retome para consultar o resultado.');
    } catch (e) {
      setError(e.name === 'AbortError' ? 'Envio pausado. Retome para continuar.' : e.message);
      setStatus('');
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  return {
    session,
    busy,
    progress,
    status,
    error,
    upload,
    forget,
    pause: () => controller.current?.abort(),
  };
}
