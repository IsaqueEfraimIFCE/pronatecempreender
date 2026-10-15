import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTITUTIONS,
  COURSES,
  completionDate,
  validateReport,
  validateBatch,
  validCpf,
  MAX_BYTES,
} from '../index.js';
const context = { institution: 'IFCE', campus: 'fortaleza', course: COURSES[0] };
const person = {
  ...context,
  name: 'Pessoa Teste',
  cpf: '52998224725',
  email: 'TEST@example.invalid',
  city: 'Fortaleza',
  link: 'Estudante',
};
test('all official institutions and courses are preserved', () => {
  assert.equal(INSTITUTIONS.length, 30);
  assert.equal(COURSES.length, 3);
  assert.ok(INSTITUTIONS.includes('IF Sertão-PE'));
});
test('dates handle leap years, future dates and São Paulo midnight', () => {
  const now = new Date('2026-10-09T01:00:00Z');
  assert.equal(completionDate('', now), null);
  assert.equal(completionDate('2024-02-29', now), '2024-02-29');
  for (const date of ['2019-12-31', '2023-02-29', '2026-10-09', '2020-13-01', '2020-1-01'])
    assert.throws(() => completionDate(date, now));
});
test('report size, extension and campus validation', () => {
  const input = {
    ...context,
    originalName: 'document.PDF',
    size: MAX_BYTES,
    fingerprint: 'a'.repeat(64),
  };
  assert.equal(validateReport(input).campus, 'FORTALEZA');
  for (const override of [
    { size: MAX_BYTES + 1 },
    { size: 0 },
    { size: 1.5 },
    { originalName: 'malware.exe' },
    { course: 'unknown' },
    { fingerprint: 'a' },
  ])
    assert.throws(() => validateReport({ ...input, ...override }));
});
test('CPF and duplicate context validation', () => {
  assert.ok(validCpf(person.cpf));
  assert.equal(validCpf('11111111111'), false);
  const responsible = { name: 'Responsável', email: 'R@example.invalid' };
  assert.throws(() =>
    validateBatch({ responsible, participants: [person, { ...person, campus: 'FORTALÉZA' }] }),
  );
  const batch = validateBatch({
    responsible,
    participants: [person, { ...person, course: COURSES[1] }],
  });
  assert.equal(batch.participants.length, 2);
  assert.equal(batch.participants[0].email, 'test@example.invalid');
  assert.equal(batch.responsible.email, 'r@example.invalid');
});
