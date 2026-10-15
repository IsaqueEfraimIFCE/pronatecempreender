import { readConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createStorage } from './storage/s3.js';
import { createApp } from './app.js';
const config = readConfig(),
  pool = createPool(config),
  storage = createStorage(config);
const app = await createApp({ config, pool, storage });
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
await app.listen({ port: config.port, host: '0.0.0.0' });
