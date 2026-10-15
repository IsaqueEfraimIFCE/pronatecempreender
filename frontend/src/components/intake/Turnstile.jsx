import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/intakeClient';
let scriptPromise;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise)
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Verificação indisponível. Atualize a página.'));
      };
      document.head.appendChild(script);
    });
  return scriptPromise;
}
export function Turnstile({ onToken, revision = 0 }) {
  const container = useRef(null),
    callback = useRef(onToken),
    [error, setError] = useState('');
  callback.current = onToken;
  useEffect(() => {
    let disposed = false,
      widget;
    callback.current('');
    api('/catalogs')
      .then(async (config) => {
        if (!config.siteKey) return;
        const turnstile = await loadScript();
        if (disposed) return;
        widget = turnstile.render(container.current, {
          sitekey: config.siteKey,
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(''),
          'error-callback': () => {
            callback.current('');
            setError('Verificação indisponível. Atualize a página.');
          },
        });
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      if (widget !== undefined) window.turnstile?.remove(widget);
    };
  }, [revision]);
  return (
    <div>
      <div ref={container} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
