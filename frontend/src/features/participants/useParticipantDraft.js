import { useEffect, useState } from 'react';
const KEY = 'pronatec.participants.v1';
export const emptyParticipant = () => ({
  name: '',
  cpf: '',
  email: '',
  city: '',
  link: 'Estudante',
});
const empty = () => ({
  responsible: { name: '', email: '' },
  participants: [],
  context: {},
  entry: emptyParticipant(),
  editing: null,
  review: false,
  id: crypto.randomUUID(),
  savedAt: Date.now(),
});
function restore() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(KEY));
    if (draft && Date.now() - draft.savedAt < 24 * 3600 * 1000) return draft;
  } catch {}
  return empty();
}
export function useParticipantDraft() {
  const [draft, setDraft] = useState(restore);
  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  }, [draft]);
  const change = (patch) =>
    setDraft((old) => ({ ...old, ...patch, review: false, id: crypto.randomUUID() }));
  const clear = () => {
    sessionStorage.removeItem(KEY);
    setDraft(empty());
  };
  return { draft, setDraft, change, clear };
}
