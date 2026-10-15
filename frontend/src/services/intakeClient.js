export async function api(path, { method = 'GET', body, secret, signal } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(secret ? { 'X-Upload-Secret': secret } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Não foi possível concluir a solicitação.');
  return result;
}
export const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
export const fingerprint = async (file) =>
  hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
