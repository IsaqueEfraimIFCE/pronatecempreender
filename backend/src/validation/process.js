import { mkdtemp, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { verifyFormat, RejectedFile } from './formats.js';
import { scanFile } from './clamav.js';

export async function validateStoredReport(row, storage, config) {
  const directory = await mkdtemp(join(tmpdir(), 'pronatec-'));
  try {
    const path = join(directory, 'report'),
      hash = createHash('sha256');
    let size = 0;
    const meter = new Transform({
      transform(chunk, encoding, callback) {
        size += chunk.length;
        if (size > Number(row.size_bytes))
          return callback(new RejectedFile('Tamanho de arquivo inválido.'));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    const object = await storage.get(row.object_key);
    await pipeline(object.Body, meter, createWriteStream(path, { mode: 0o600 }));
    const sha256 = hash.digest('hex');
    if (size !== Number(row.size_bytes) || sha256 !== row.metadata.fingerprint)
      throw new RejectedFile('O arquivo não corresponde ao envio original.');
    await scanFile(path, config);
    await verifyFormat(path, row.metadata.extension);
    return sha256;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
