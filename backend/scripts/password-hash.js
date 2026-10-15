import { randomBytes, scryptSync } from 'node:crypto';
let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.trim();
if (password.length < 14) throw new Error('Use a passphrase of at least 14 characters.');
const salt = randomBytes(16).toString('hex');
console.log(`scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
