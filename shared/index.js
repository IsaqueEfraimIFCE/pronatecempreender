export const INSTITUTIONS = Object.freeze([
  'CEFET/MG',
  'IFAC',
  'IFAL',
  'IFAM',
  'IFAP',
  'IFBA',
  'IFC',
  'IFCE',
  'IFES',
  'IFF',
  'IFFar',
  'IFG',
  'IFGOIANO',
  'IFMA',
  'IFMG',
  'IFMS',
  'IFMT',
  'IFNMG',
  'IFPA',
  'IFPB',
  'IFPI',
  'IFRN',
  'IFRR',
  'IFRS',
  'IF Sertão-PE',
  'IFSP',
  'IFSuldeMINAS',
  'IFTO',
  'UFSM',
  'UFV',
]);
export const COURSES = Object.freeze([
  'App Clicks – Construção Rápida de Apps para Mídias Digitais',
  'Drones e Impressoras 3D – Operação e Manutenção',
  'Negócios Inovadores Apoiados por Inteligência Artificial',
]);
export const ROLES = Object.freeze(['Docente', 'Estudante']);
export const EXTENSIONS = Object.freeze(['pdf', 'docx', 'pptx', 'doc', 'ppt', 'odt', 'odp']);
export const MAX_BYTES = 100 * 1024 * 1024;
export const PART_BYTES = 8 * 1024 * 1024;
export const MAX_PARTICIPANTS = 1000;
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}
export function text(value, label, max = 160, optional = false) {
  if (typeof value !== 'string') {
    if (optional && value == null) return '';
    throw new InputError(`Informe ${label}.`);
  }
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if ((!clean && !optional) || clean.length > max)
    throw new InputError(`${label}: preencha até ${max} caracteres.`);
  return clean;
}
export function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}
export function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}
export function validCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(cpf[length])) return false;
  }
  return true;
}
export function email(value, label) {
  const clean = text(value, label, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new InputError(`${label}: e-mail inválido.`);
  return clean;
}
export function context(input) {
  if (!input || typeof input !== 'object') throw new InputError('Dados da turma inválidos.');
  const institution = INSTITUTIONS.find(
    (item) => normalize(item) === normalize(text(input.institution, 'instituição', 80)),
  );
  const course = text(input.course, 'curso', 220);
  if (!institution || !COURSES.includes(course))
    throw new InputError('Instituição ou curso inválido.');
  return {
    institution,
    campus: text(input.campus, 'campus', 120).toLocaleUpperCase('pt-BR'),
    course,
  };
}
export function todayInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function completionDate(value, now = new Date()) {
  const date = text(value, 'data de conclusão', 10, true);
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const parsed = new Date(`${date}T12:00:00Z`);
  const today = todayInSaoPaulo(now);
  if (
    !match ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    Number(match[1]) < 2020 ||
    date > today
  )
    throw new InputError('Informe uma data real entre 2020 e hoje.');
  return date;
}
export function validateReport(input, now) {
  const data = context(input);
  const originalName = text(input.originalName, 'nome do arquivo', 240);
  const extension = originalName.split('.').pop().toLowerCase();
  if (!EXTENSIONS.includes(extension)) throw new InputError('Formato de arquivo não permitido.');
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_BYTES)
    throw new InputError('Envie um arquivo não vazio de até 100 MiB.');
  if (!/^[a-f0-9]{64}$/.test(input.fingerprint ?? ''))
    throw new InputError('Identificação do arquivo inválida.');
  return {
    ...data,
    completionDate: completionDate(input.completionDate, now),
    originalName,
    extension,
    size: input.size,
    fingerprint: input.fingerprint,
  };
}
export function enrollmentKey(participant) {
  return JSON.stringify([
    normalize(participant.institution),
    normalize(participant.campus),
    normalize(participant.course),
    digits(participant.cpf),
  ]);
}
export function validateBatch(input) {
  if (!input || typeof input !== 'object') throw new InputError('Cadastro inválido.');
  const responsible = {
    name: text(input.responsible?.name, 'nome do responsável'),
    email: email(input.responsible?.email, 'e-mail do responsável'),
  };
  if (
    !Array.isArray(input.participants) ||
    !input.participants.length ||
    input.participants.length > MAX_PARTICIPANTS
  )
    throw new InputError('Cada envio deve conter de 1 a 1.000 participantes.');
  const keys = new Set();
  const participants = input.participants.map((item) => {
    const base = context(item);
    const cpf = digits(text(item.cpf, 'CPF', 20));
    if (!validCpf(cpf)) throw new InputError('CPF inválido. Confira os dígitos informados.');
    const link = text(item.link, 'vínculo', 40);
    if (!ROLES.includes(link)) throw new InputError('Vínculo inválido.');
    const participant = {
      ...base,
      name: text(item.name, 'nome completo'),
      cpf,
      email: email(item.email, 'e-mail do participante'),
      city: text(item.city, 'cidade', 120),
      link,
    };
    const key = enrollmentKey(participant);
    if (keys.has(key)) throw new InputError('Existe matrícula duplicada no mesmo campus e curso.');
    keys.add(key);
    return participant;
  });
  return { responsible, participants };
}
