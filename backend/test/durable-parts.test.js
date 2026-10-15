import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createDurablePartsStorage } from '../src/storage/durable-parts.js';

test('durable upload resumes after adapter restart, assembles in order and cleans only its parts', async () => {
  const objects = new Map();
  const client = { async send(command) {
    const { Key, Body, Prefix } = command.input;
    switch (command.constructor.name) {
      case 'PutObjectCommand': {
        const chunks = [];
        if (typeof Body === 'string') chunks.push(Buffer.from(Body));
        else for await (const chunk of Body) chunks.push(Buffer.from(chunk));
        const value = Buffer.concat(chunks);
        if (command.input.ContentLength !== undefined)
          assert.equal(value.length, command.input.ContentLength);
        objects.set(Key, value);
        return {};
      }
      case 'GetObjectCommand': {
        assert.ok(objects.has(Key));
        const value = objects.get(Key);
        const body = Readable.from([value]);
        body.transformToString = async () => value.toString();
        return { Body: body };
      }
      case 'ListObjectsV2Command':
        return { Contents: [...objects].filter(([key]) => key.startsWith(Prefix))
          .map(([key, body]) => ({ Key: key, Size: body.length, ETag: 'synthetic' })) };
      case 'DeleteObjectCommand': objects.delete(Key); return {};
      default: throw new Error('Unexpected command');
    }
  } };
  let storage = createDurablePartsStorage({}, client, client, 'reports');
  const id = await storage.create('reports/test.pdf', 'synthetic-fingerprint');
  objects.set(`_uploads/${id}/00002`, Buffer.from('second'));
  objects.set(`_uploads/${id}/00001`, Buffer.from('first'));
  objects.set('unrelated-object', Buffer.from('preserve'));
  // Reconstructing the adapter models loss of all process-local state.
  storage = createDurablePartsStorage({}, client, client, 'reports');
  const parts = await storage.parts('reports/test.pdf', id);
  assert.equal(parts.length, 2);
  await assert.rejects(() => storage.parts('wrong-target.pdf', id));
  await storage.complete('reports/test.pdf', id, parts);
  assert.equal(objects.get('reports/test.pdf').toString(), 'firstsecond');
  // Completion can be retried after restart before validation commits.
  await storage.complete('reports/test.pdf', id, parts);
  await storage.cleanupCompleted('reports/test.pdf', id);
  await storage.cleanupCompleted('reports/test.pdf', id);
  assert.deepEqual([...objects.keys()].sort(), ['reports/test.pdf', 'unrelated-object']);
});
