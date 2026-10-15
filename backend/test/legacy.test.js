import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/modules/legacy/csv-parse.js';
import { accessKeyMatches } from '../src/security.js';
import {
  mapHeaders,
  interestedRecord,
  offerRecord,
  parseTimestamp,
  startMonth,
} from '../src/modules/legacy/mapping.js';
import {
  setecSummary,
  coordinationSummary,
  maskName,
  normalizeStateLabel,
  regionFromState,
  ageRange,
} from '../src/modules/legacy/summary.js';

// Header texts as they appear in the original Apps Script (Code.gs, getDashboardIndexes_).
const FORM_HEADERS = [
  'Carimbo de data/hora',
  'Endereço de e-mail',
  'CPF (somente os números)',
  'Nome Completo',
  'Para qual curso você está se inscrevendo?',
  'Idade',
  'Telefone',
  'Estado',
  'Cidade: (se Fortaleza)',
  'Cidade: (outra)',
  'Observações',
];

test('parseCsv handles BOM, semicolons, quoted delimiters and embedded newlines', () => {
  const rows = parseCsv('﻿A;B\r\n"x;1";"linha 1\nlinha 2"\r\n\r\n"a ""q"" b";2\r\n');
  assert.deepEqual(rows, [
    ['A', 'B'],
    ['x;1', 'linha 1\nlinha 2'],
    ['a "q" b', '2'],
  ]);
});

test('parseCsv rejects unterminated quotes', () => {
  assert.throws(() => parseCsv('A,B\n"x,1\n'), /aspas/);
});

test('mapHeaders finds the original form columns and reports the rest', () => {
  const { columns, unmapped, missing } = mapHeaders('interested', FORM_HEADERS);
  assert.deepEqual(columns.get('cpf'), [2]);
  assert.deepEqual(columns.get('name'), [3]);
  assert.deepEqual(columns.get('course'), [4]);
  assert.deepEqual(columns.get('age'), [5]);
  assert.deepEqual(columns.get('state'), [7]);
  assert.deepEqual(columns.get('city'), [8, 9]); // multi: first non-empty wins
  assert.deepEqual(unmapped, ['Observações']);
  assert.deepEqual(missing, []);
});

test('a specific alias wins over a broad one that appears inside another header', () => {
  const headers = [
    'Nome Completo',
    'CPF (somente os números)',
    'Se você respondeu “Empregado(a) com remuneração em dinheiro”, informe o tipo de vínculo',
    'Raça / Cor',
  ];
  const { columns } = mapHeaders('interested', headers);
  assert.deepEqual(columns.get('race'), [3]);
});

test('mapHeaders reports missing required columns and honours explicit overrides', () => {
  assert.deepEqual(mapHeaders('interested', ['Documento', 'Pessoa']).missing, ['cpf', 'name']);
  const mapped = mapHeaders('interested', ['Documento', 'Pessoa'], {
    Documento: 'cpf',
    Pessoa: 'name',
  });
  assert.deepEqual(mapped.missing, []);
  assert.deepEqual(mapped.columns.get('cpf'), [0]);
});

test('interestedRecord stores no contact data, keeps presence flags and every row', () => {
  const { columns } = mapHeaders('interested', FORM_HEADERS);
  const row = [
    '15/10/2026 14:30:00',
    'm@x.br',
    '529.982.247-25',
    'Maria  da Silva',
    'Curso A',
    '31',
    '85 99999-0000',
    'Ceará',
    '',
    'Sobral',
    '',
  ];
  const { record } = interestedRecord(columns, row);
  assert.equal(record.cpf, '52998224725');
  assert.equal(record.name, 'Maria  da Silva'.trim());
  assert.equal(record.course, 'Curso A');
  assert.equal(record.fields.city, 'Sobral');
  assert.equal(record.fields.hasEmail, '1');
  assert.equal(record.fields.hasPhone, '1');
  assert.ok(!JSON.stringify(record.fields).includes('m@x.br'));
  assert.ok(!JSON.stringify(record.fields).includes('99999'));
  assert.equal(record.submittedAt.toISOString(), '2026-10-15T14:30:00.000Z');
  // Original dashboards counted rows without CPF instead of dropping them.
  const noCpf = interestedRecord(columns, ['', '', '', 'Sem CPF', '', '', '', '', '', '', '']);
  assert.equal(noCpf.record.cpf, '');
  assert.equal(noCpf.record.fields.hasEmail, '');
});

test('timestamps and start months accept Brazilian and ISO formats', () => {
  assert.equal(parseTimestamp('31/02/2026'), null);
  assert.equal(startMonth('05/09/2026'), '2026-09');
  assert.equal(startMonth('2026-10-01'), '2026-10');
  assert.equal(startMonth('11/2026'), '2026-11');
  assert.equal(startMonth('em breve'), '');
});

test('offerRecord parses vacancies and requires an institution', () => {
  const { columns } = mapHeaders('offers', [
    'Instituição',
    'Campus',
    'Vagas ofertadas',
    'Data de início',
  ]);
  assert.deepEqual(
    offerRecord(columns, ['IFCE', 'Fortaleza', '1.200 vagas', '01/08/2026']).record,
    {
      institution: 'IFCE',
      campus: 'Fortaleza',
      region: '',
      course: '',
      vacancies: 1200,
      startMonth: '2026-08',
    },
  );
  assert.deepEqual(offerRecord(columns, ['', 'X', '10', '']), { skip: 'missing_institution' });
});

test('state and region rules match the original script', () => {
  assert.equal(normalizeStateLabel('ceara'), 'CE - Ceara');
  assert.equal(normalizeStateLabel('SP'), 'SP - Sao Paulo');
  assert.equal(normalizeStateLabel(' Atlantis '), 'Atlantis');
  assert.equal(regionFromState('CE - Ceara'), 'Nordeste');
  assert.equal(regionFromState('Atlantis'), 'Nao identificado');
  assert.equal(regionFromState(''), 'Nao informado');
});

test('ageRange buckets like the original', () => {
  assert.equal(ageRange('17'), 'Ate 17');
  assert.equal(ageRange('18,9 anos'), '18 a 24');
  assert.equal(ageRange('44'), '35 a 44');
  assert.equal(ageRange('60'), '60+');
  assert.equal(ageRange('5'), 'Nao informado');
  assert.equal(ageRange(''), 'Nao informado');
});

test('setecSummary follows the original aggregation, trimming and quality counters', () => {
  const row = (cpfHash, course, fields) => ({ cpfHash, course, fields });
  const rows = [
    row('h1', 'Curso A', { state: 'ceara', city: 'Fortaleza', age: '20', hasEmail: '1', hasPhone: '1', aiLevel: 'Basico' }),
    row('h1', 'Curso A', { state: 'CE', city: 'Sobral', age: '40', hasEmail: '1' }),
    row('h2', 'Curso B', { state: 'SP', city: '', age: 'x', hasPhone: '1', ownBusiness: 'Sim' }),
    row('', '', { state: '' }),
  ];
  const s = setecSummary(rows, 90);
  assert.equal(s.totalResponses, 4);
  assert.equal(s.agreedVacancies, 90);
  assert.equal(s.uniqueCpfs, 2);
  assert.equal(s.duplicateCpfs, 1);
  assert.deepEqual(s.byCourse, [
    { label: 'Curso A', count: 2 },
    { label: 'Curso B', count: 1 },
    { label: 'Nao informado', count: 1 },
  ]);
  assert.deepEqual(s.byState[0], { label: 'CE - Ceara', count: 2 });
  assert.deepEqual(s.byRegion[0], { label: 'Nordeste', count: 2 });
  assert.deepEqual(s.byAgeRange.find((i) => i.label === '35 a 44'), { label: '35 a 44', count: 1 });
  assert.deepEqual(s.byOwnBusiness[0], { label: 'Nao informado', count: 3 });
  assert.deepEqual(s.courseReadiness.ai, [{ label: 'Basico', count: 1 }]);
  assert.deepEqual(s.courseReadiness.drones, []);
  assert.deepEqual(s.quality, {
    missingCpf: 1,
    missingCourse: 1,
    missingCity: 2,
    missingEmail: 2,
    missingPhone: 2,
  });
});

test('setecSummary keeps only the top 12 labels per list', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    cpfHash: `h${i}`,
    course: `Curso ${i}`,
    fields: {},
  }));
  assert.equal(setecSummary(rows).byCourse.length, 12);
});

test('coordinationSummary matches the dashboard contract', () => {
  const offer = (institution, campus, region, course, vacancies, month) => ({
    institution,
    campus,
    region,
    course,
    vacancies,
    startMonth: month,
  });
  const summary = coordinationSummary([
    offer('IFCE', 'A', 'Nordeste', 'C1', 30, '2026-09'),
    offer('IFCE', 'B', 'Nordeste', 'C1', 20, '2026-08'),
    offer('IFSP', 'X', 'Sudeste', 'C2', 40, ''),
  ]);
  assert.equal(summary.totalRecords, 3);
  assert.deepEqual(summary.metrics, [
    { label: 'Instituições', value: 2 },
    { label: 'Vagas', value: 90 },
    { label: 'Regiões', value: 2 },
    { label: 'Campi', value: 3 },
  ]);
  const chart = (id) => summary.charts.find((item) => item.id === id).items;
  assert.deepEqual(chart('starts-by-month'), [
    {
      label: 'Ago/2026',
      count: 1,
      details: [{ campus: 'B', course: 'C1', institution: 'IFCE' }],
    },
    {
      label: 'Set/2026',
      count: 1,
      details: [{ campus: 'A', course: 'C1', institution: 'IFCE' }],
    },
    {
      label: 'Sem data',
      count: 1,
      details: [{ campus: 'X', course: 'C2', institution: 'IFSP' }],
    },
  ]);
  assert.deepEqual(chart('institutions'), [
    { label: 'IFCE', count: 50 },
    { label: 'IFSP', count: 40 },
  ]);
});

test('dashboard access code is compared exactly and is disabled when unset', () => {
  const config = { dashboardKey: 'correct-horse-battery' };
  assert.equal(accessKeyMatches(config, 'correct-horse-battery'), true);
  assert.equal(accessKeyMatches(config, '  correct-horse-battery '), true);
  assert.equal(accessKeyMatches(config, 'correct-horse-batterY'), false);
  assert.equal(accessKeyMatches(config, ''), false);
  assert.equal(accessKeyMatches(config, { toString: () => 'correct-horse-battery' }), false);
  assert.equal(accessKeyMatches({ dashboardKey: '' }, ''), false);
});

test('maskName keeps the first word and reduces every other word to an initial', () => {
  assert.equal(maskName('Maria da Silva Santos'), 'Maria D. S. S.');
  assert.equal(maskName('  joão '), 'joão');
  assert.equal(maskName(''), '');
});
