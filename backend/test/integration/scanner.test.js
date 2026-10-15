import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanFile } from '../../src/validation/clamav.js';
import { RejectedFile } from '../../src/validation/formats.js';
test('real ClamAV accepts clean files and rejects the standard EICAR test string', async () => {
  assert.ok(process.env.TEST_CLAMD_HOST, 'Set TEST_CLAMD_HOST to the test scanner');
  const directory = await mkdtemp(join(tmpdir(), 'pronatec-scan-test-'));
  const config = {
    clamHost: process.env.TEST_CLAMD_HOST,
    clamPort: Number(process.env.TEST_CLAMD_PORT || 3310),
  };
  try {
    const path = join(directory, 'test.txt');
    await writeFile(path, 'Clean test document');
    await scanFile(path, config);
    await assert.rejects(() => scanFile(path, { ...config, clamPort: 1 }));
    const marker = [
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$',
      'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    ].join('');
    await writeFile(path, marker);
    await assert.rejects(() => scanFile(path, config), RejectedFile);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
