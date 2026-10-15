import net from 'node:net';
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { RejectedFile } from './formats.js';

export async function scanFile(path, config) {
  const socket = net.createConnection({ host: config.clamHost, port: config.clamPort });
  const response = new Promise((resolve, reject) => {
    let result = '';
    socket.on('data', (chunk) => {
      result += chunk.toString();
      if (result.includes('\0') || result.includes('\n')) resolve(result);
    });
    socket.on('error', reject);
    socket.on('end', () =>
      result ? resolve(result) : reject(new Error('Scanner closed without a result')),
    );
    socket.setTimeout(120000, () => socket.destroy(new Error('Scanner timed out')));
  });
  // Attach immediately: connection errors must not become unhandled rejections.
  response.catch(() => {});
  try {
    await once(socket, 'connect');
    socket.write('zINSTREAM\0');
    for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(chunk.length);
      socket.write(length);
      if (!socket.write(chunk)) await once(socket, 'drain');
    }
    socket.write(Buffer.alloc(4));
    const result = await response;
    if (result.includes(' FOUND'))
      throw new RejectedFile('O arquivo foi rejeitado pela verificação de segurança.');
    if (!result.includes(': OK')) throw new Error('Scanner did not confirm a clean file');
  } finally {
    socket.destroy();
  }
}
