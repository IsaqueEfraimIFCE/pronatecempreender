// Execute the existing integration suite only in its disposable schemas/buckets.
// These variables are passed in memory; no credentials go to command arguments/logs.
import { spawn } from 'node:child_process';
const env = {
  ...process.env,
  TEST_DATABASE_URL: process.env.DATABASE_URL,
  TEST_S3_ENDPOINT: process.env.S3_ENDPOINT,
  TEST_S3_ACCESS_KEY: process.env.S3_ACCESS_KEY_ID,
  TEST_S3_SECRET_KEY: process.env.S3_SECRET_ACCESS_KEY,
  TEST_S3_DURABLE_PARTS: 'true',
  TEST_CLAMD_HOST: process.env.CLAMD_HOST,
};
const child = spawn(process.execPath, ['--test', 'backend/test/integration/intake.test.js',
  'backend/test/integration/scanner.test.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });
child.once('close', (code) => {
  // Integration assertions can contain signed URLs. Print test result lines only.
  for (const line of output.split('\n'))
    if (/^(?:# (?:tests|pass|fail|duration_ms)|\s*(?:ok|not ok) \d+ -)/.test(line))
      console.log(line);
  if (code) {
    let safe = output;
    for (const [name, value] of Object.entries(env))
      if (/KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL/.test(name) && value && value.length > 8)
        safe = safe.replaceAll(value, '[REDACTED]');
    safe = safe.replace(/https?:\/\/[^\s'"<>]+/g, '[URL withheld]');
    for (const line of safe.split('\n'))
      if (/^\s*(?:#\s*)?(?:error|code|name|message|failureType):/.test(line)) console.log(line);
  }
  process.exitCode = code ?? 1;
});
