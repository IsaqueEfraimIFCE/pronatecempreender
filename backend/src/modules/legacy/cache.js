// Single-entry cache validated by a cheap "snapshot key" read on every call: the value is
// reused while the key is unchanged and recomputed once (shared by concurrent callers)
// when it changes. Because the key reflects the table contents, the cache cannot serve
// data older than the last import or sync.
export function createSnapshotCache(readKey, compute) {
  let entry = null;
  let pending = null;
  return async function get() {
    const key = await readKey();
    if (entry && entry.key === key) return entry.value;
    if (pending && pending.key === key) return pending.promise;
    const promise = (async () => {
      const value = await compute();
      entry = { key, value };
      return value;
    })();
    pending = { key, promise };
    try {
      return await promise;
    } finally {
      if (pending && pending.promise === promise) pending = null;
    }
  };
}
