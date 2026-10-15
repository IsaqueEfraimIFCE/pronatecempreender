import { readFile, open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import yauzl from 'yauzl';
import CFB from 'cfb';

export class RejectedFile extends Error {}
export async function verifyFormat(path, extension) {
  if (extension === 'pdf') {
    const file = await open(path, 'r');
    try {
      const size = (await file.stat()).size,
        first = Buffer.alloc(8),
        last = Buffer.alloc(Math.min(size, 2048));
      await file.read(first, 0, first.length, 0);
      await file.read(last, 0, last.length, Math.max(0, size - last.length));
      if (!first.toString('ascii').startsWith('%PDF-') || !last.toString('ascii').includes('%%EOF'))
        throw new RejectedFile('O arquivo não é um PDF válido.');
    } finally {
      await file.close();
    }
    let previous = '';
    for await (const chunk of createReadStream(path)) {
      const content = previous + chunk.toString('latin1');
      if (/\/(?:E|#45)(?:n|#6[eE])(?:c|#63)(?:r|#72)(?:y|#79)(?:p|#70)(?:t|#74)\b/.test(content))
        throw new RejectedFile('PDF criptografado não é permitido.');
      previous = content.slice(-80);
    }
    return;
  }
  if (['doc', 'ppt'].includes(extension)) {
    const bytes = await readFile(path);
    if (bytes.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1')
      throw new RejectedFile('Documento Office inválido.');
    let compound;
    try {
      compound = CFB.read(bytes, { type: 'buffer' });
    } catch {
      throw new RejectedFile('Documento Office corrompido.');
    }
    const names = compound.FileIndex.map((entry) => entry.name);
    if (
      !names.includes(extension === 'doc' ? 'WordDocument' : 'PowerPoint Document') ||
      names.some((name) => /vba|macros/i.test(name))
    )
      throw new RejectedFile('Formato incorreto ou documento com macros.');
    return;
  }
  await new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(new RejectedFile('Documento compactado inválido.'));
      const entries = new Set();
      let total = 0,
        count = 0,
        mimetype = '';
      let settled = false;
      function fail(message) {
        if (settled) return;
        settled = true;
        zip.close();
        reject(new RejectedFile(message));
      }
      zip.on('error', () => fail('Documento compactado corrompido.'));
      zip.on('entry', (entry) => {
        total += entry.uncompressedSize;
        count++;
        if (
          count > 5000 ||
          total > 300 * 1024 ** 2 ||
          entry.generalPurposeBitFlag & 1 ||
          /vbaProject|\/macros\//i.test(entry.fileName)
        )
          return fail('Documento criptografado, com macros ou conteúdo excessivo.');
        entries.add(entry.fileName);
        if (entry.fileName === 'mimetype') {
          if (entry.uncompressedSize > 200) return fail('Formato OpenDocument inválido.');
          zip.openReadStream(entry, (error, stream) => {
            if (error) return fail('Documento corrompido.');
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('error', () => fail('Documento corrompido.'));
            stream.on('end', () => {
              mimetype = Buffer.concat(chunks).toString();
              zip.readEntry();
            });
          });
        } else zip.readEntry();
      });
      zip.on('end', () => {
        if (settled) return;
        const valid =
          extension === 'docx'
            ? entries.has('[Content_Types].xml') && entries.has('word/document.xml')
            : extension === 'pptx'
              ? entries.has('[Content_Types].xml') && entries.has('ppt/presentation.xml')
              : entries.has('content.xml') &&
                mimetype ===
                  `application/vnd.oasis.opendocument.${extension === 'odt' ? 'text' : 'presentation'}`;
        if (!valid) return fail('O conteúdo não corresponde ao formato informado.');
        settled = true;
        resolve();
      });
      zip.readEntry();
    });
  });
}
