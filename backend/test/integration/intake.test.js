import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, scryptSync, createHash } from 'node:crypto';
import pg from 'pg';
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { createApp } from '../../src/app.js';
import { createStorage } from '../../src/storage/s3.js';
import { migrate } from '../../src/db/migrate.js';
import { COURSES, PART_BYTES } from '@pronatec/shared';

test('real PostgreSQL and S3: resume, permissions, atomic batches and retries', async (t) => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated test database');
  const base = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  assert.ok(process.env.TEST_S3_ENDPOINT, 'Set TEST_S3_ENDPOINT to a local S3 test server');
  const bucket = `test-${randomUUID()}`;
  const s3 = new S3Client({
    endpoint: process.env.TEST_S3_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.TEST_S3_ACCESS_KEY || 'test',
      secretAccessKey: process.env.TEST_S3_SECRET_KEY || 'test',
    },
  });
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  let app;
  t.after(async () => {
    if (app) await app.close();
    await pool.end();
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.end();
    const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    if (objects.Contents?.length)
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key })) },
        }),
      );
    const uploads = process.env.TEST_S3_DURABLE_PARTS === 'true'
      ? { Uploads: [] }
      : await s3.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
    for (const u of uploads.Uploads || [])
      await s3.send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.Key, UploadId: u.UploadId }),
      );
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    s3.destroy();
  });
  const password = 'test passphrase for isolated integration';
  const config = {
    origin: 'http://portal.test',
    production: false,
    securityKey: 'x'.repeat(32),
    bypass: true,
    adminHash: `scrypt:salt:${scryptSync(password, 'salt', 64).toString('hex')}`,
    trustProxy: false,
    uploadLimit: 10,
    storageQuota: 1024 ** 3,
    dailyQuota: 1024 ** 3,
    s3: {
      durableParts: process.env.TEST_S3_DURABLE_PARTS === 'true',
      endpoint: process.env.TEST_S3_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      bucket,
      credentials: {
        accessKeyId: process.env.TEST_S3_ACCESS_KEY || 'test',
        secretAccessKey: process.env.TEST_S3_SECRET_KEY || 'test',
      },
    },
  };
  const storage = createStorage(config);
  await migrate(pool);
  app = await createApp({ pool, storage, config }, { staticFiles: false, logger: false });
  const request = (method, url, payload, headers = {}) =>
    app.inject({ method, url, payload, headers });
  await t.test(
    'anonymous callers cannot list, export or download; cross-origin writes are rejected',
    async () => {
      for (const url of [
        '/api/admin/reports',
        '/api/admin/reports.csv',
        '/api/admin/participants.csv?batchId=' + randomUUID(),
        '/api/admin/reports/' + randomUUID() + '/file',
      ])
        assert.equal((await request('GET', url)).statusCode, 401);
      assert.equal(
        (
          await request(
            'POST',
            '/api/admin/login',
            { password },
            { origin: 'https://evil.example' },
          )
        ).statusCode,
        403,
      );
    },
  );
  const login = await request('POST', '/api/admin/login', { password });
  assert.equal(login.statusCode, 200);
  const setCookie = login.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
  await t.test(
    'upload resumes only missing parts and is quarantined until verification',
    async () => {
      const bytes = Buffer.alloc(PART_BYTES + 1024, 32);
      bytes.write('%PDF-1.7\n');
      bytes.write('\n%%EOF', bytes.length - 7);
      const id = randomUUID(),
        secret = 'a'.repeat(64),
        payload = {
          id,
          secret,
          institution: 'IFCE',
          campus: 'fortaleza',
          course: COURSES[0],
          originalName: 'private.pdf',
          size: bytes.length,
          fingerprint: createHash('sha256').update(bytes).digest('hex'),
        };
      assert.equal((await request('POST', '/api/reports', payload)).statusCode, 200);
      assert.equal(
        (
          await request('GET', `/api/reports/${id}`, undefined, {
            'x-upload-secret': 'b'.repeat(64),
          })
        ).statusCode,
        404,
      );
      const sign1 = (
        await request('POST', `/api/reports/${id}/parts/1`, undefined, {
          'x-upload-secret': secret,
        })
      ).json();
      assert.equal(
        (await fetch(sign1.url, { method: 'PUT', body: bytes.subarray(0, PART_BYTES) })).status,
        200,
      );
      const statusResponse = await request('GET', `/api/reports/${id}`, undefined, {
        'x-upload-secret': secret,
      });
      assert.equal(statusResponse.statusCode, 200, statusResponse.body);
      let status = statusResponse.json();
      assert.equal(status.parts.length, 1);
      assert.equal(status.parts[0].size, PART_BYTES);
      assert.equal(
        (
          await request('POST', `/api/reports/${id}/complete`, undefined, {
            'x-upload-secret': secret,
          })
        ).statusCode,
        400,
      );
      const sign2 = (
        await request('POST', `/api/reports/${id}/parts/2`, undefined, {
          'x-upload-secret': secret,
        })
      ).json();
      assert.equal(
        (await fetch(sign2.url, { method: 'PUT', body: bytes.subarray(PART_BYTES) })).status,
        200,
      );
      assert.equal(
        (
          await request('POST', `/api/reports/${id}/complete`, undefined, {
            'x-upload-secret': secret,
          })
        ).json().status,
        'validating',
      );
      assert.equal(
        (await request('GET', `/api/admin/reports/${id}/file`, undefined, { cookie })).statusCode,
        404,
      );
      assert.equal((await storage.get(`reports/${id}.pdf`)).ContentLength, bytes.length);
      assert.equal(
        (
          await request('POST', `/api/reports/${id}/complete`, undefined, {
            'x-upload-secret': secret,
          })
        ).json().status,
        'validating',
      );
      await pool.query("UPDATE reports SET status='received' WHERE id=$1", [id]);
      assert.equal(
        (await request('GET', `/api/admin/reports/${id}/file`, undefined, { cookie })).statusCode,
        302,
      );
      const csv = await request('GET', '/api/admin/reports.csv', undefined, { cookie });
      assert.equal(csv.statusCode, 200);
      assert.ok(csv.body.includes('FORTALEZA'));
      assert.ok(csv.body.includes('/api/admin/reports/'));
      assert.ok(!csv.body.includes('X-Amz-Signature'));
    },
  );
  await t.test(
    'batches are atomic, idempotent and allow the same CPF in different courses',
    async () => {
      const person = {
        institution: 'IFCE',
        campus: 'Fortaleza',
        course: COURSES[0],
        name: 'Pessoa Teste',
        cpf: '52998224725',
        email: 'p@example.invalid',
        city: 'Fortaleza',
        link: 'Estudante',
      };
      const batch = {
        id: randomUUID(),
        responsible: { name: 'Pessoa Responsável', email: 'r@example.invalid' },
        participants: [person],
      };
      const concurrent = await Promise.all([
        request('POST', '/api/registrations', batch),
        request('POST', '/api/registrations', batch),
      ]);
      assert.deepEqual(
        concurrent.map((r) => r.statusCode),
        [200, 200],
      );
      assert.equal(Number((await pool.query('SELECT count(*) FROM enrollments')).rows[0].count), 1);
      const duplicate = {
        ...batch,
        id: randomUUID(),
        participants: [{ ...person, course: COURSES[1] }, person],
      };
      assert.equal((await request('POST', '/api/registrations', duplicate)).statusCode, 409);
      assert.equal(Number((await pool.query('SELECT count(*) FROM enrollments')).rows[0].count), 1);
      assert.equal(
        (
          await request('POST', '/api/registrations', {
            ...batch,
            id: randomUUID(),
            participants: [{ ...person, course: COURSES[1] }],
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (
          await request('POST', '/api/registrations', {
            ...batch,
            responsible: { ...batch.responsible, name: 'Changed' },
          })
        ).statusCode,
        400,
      );
      const exportResult = await request(
        'GET',
        `/api/admin/participants.csv?batchId=${batch.id}`,
        undefined,
        { cookie },
      );
      assert.equal(exportResult.statusCode, 200);
      assert.ok(exportResult.body.includes(person.cpf));
    },
  );
  await t.test(
    'expired sessions cannot sign new parts and quota reservations are enforced',
    async () => {
      const id = randomUUID(),
        secret = 'c'.repeat(64),
        payload = {
          id,
          secret,
          institution: 'IFCE',
          campus: 'Sobral',
          course: COURSES[0],
          originalName: 'pending.pdf',
          size: 1024,
          fingerprint: 'f'.repeat(64),
        };
      assert.equal((await request('POST', '/api/reports', payload)).statusCode, 200);
      await pool.query("UPDATE reports SET expires_at=now()-interval '1 second' WHERE id=$1", [id]);
      assert.equal(
        (
          await request('POST', `/api/reports/${id}/parts/1`, undefined, {
            'x-upload-secret': secret,
          })
        ).statusCode,
        400,
      );
      config.storageQuota = 1;
      assert.equal(
        (await request('POST', '/api/reports', { ...payload, id: randomUUID() })).statusCode,
        429,
      );
    },
  );
});
