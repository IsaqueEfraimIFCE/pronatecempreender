import { digits } from '@pronatec/shared';

// Column rules ported from the original Apps Script (apps-script/Code.gs, git history
// commit 9fdb4d5, getDashboardIndexes_). Headers are matched like the original did:
// lower-cased, accents stripped, whitespace collapsed, then "contains" on any alias;
// the first matching column wins, except `multi` keys which use the first non-empty
// cell among every matching column. An admin can override a header explicitly.
export const plain = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const INTERESTED_COLUMNS = {
  submittedAt: { names: ['carimbo de data/hora'] },
  email: { names: ['endereco de e-mail', 'email'] },
  cpf: { names: ['cpf (somente os numeros)', 'cpf'] },
  course: { names: ['para qual curso voce esta se inscrevendo?', 'para qual curso'] },
  name: { names: ['nome completo'] },
  gender: { names: ['sexo'] },
  age: { names: ['idade'], exactFirst: true },
  phone: { names: ['telefone'] },
  education: { names: ['qual sua escolaridade'] },
  occupation: { names: ['ocupacao atual'] },
  income: { names: ['renda familiar'] },
  zone: { names: ['voce reside em qual zona'] },
  state: { names: ['estado'] },
  race: { names: ['raca / cor', 'raca'] },
  studentStatus: { names: ['atualmente e estudante de alguma instituicao'] },
  offeringInstitution: { names: ['voce estuda na instituicao que esta oferecendo'] },
  children: { names: ['voce tem filhos'] },
  benefit: { names: ['voce recebe algum beneficio'] },
  traditionalCommunity: { names: ['voce pertence a algum povo ou comunidade tradicional'] },
  disability: { names: ['voce e uma pessoa com deficiencia'] },
  internetAccess: { names: ['voce tem acesso a internet'] },
  internetMode: { names: ['como voce acessa a internet'] },
  deviceAccess: { names: ['voce possui acesso a algum equipamento'] },
  ownBusiness: { names: ['voce possui negocio proprio'] },
  cnpj: { names: ['seu negocio possui cnpj'] },
  companySize: { names: ['porte da sua empresa'] },
  businessSector: { names: ['ramo de atividade principal'] },
  salesChannel: { names: ['onde voce realiza suas vendas'] },
  businessAge: { names: ['tempo de existencia do seu negocio'] },
  revenue: { names: ['faturamento mensal'] },
  businessChallenge: { names: ['areas do seu negocio voce encontra mais dificuldades'] },
  source: { names: ['como ficou sabendo do curso'], multi: true },
  otherTraining: { names: ['outras capacitacoes'], multi: true },
  city: { names: ['cidade:'], multi: true },
  entrepreneurshipLevel: { names: ['conhecimento previo em empreendedorismo'] },
  aiLevel: { names: ['conhecimento sobre inteligencia artificial'] },
  digitalToolsLevel: { names: ['uso de ferramentas digitais'] },
  droneExperience: { names: ['experiencia previa com drones'] },
  appDevLevel: { names: ['conhecimento previo em desenvolvimento de aplicativos'] },
};
// The Coordenação sheet's script is not in the repository; these aliases are a
// best effort and every import reports what it did not recognise.
const OFFER_COLUMNS = {
  institution: { names: ['instituicao', 'instituto', 'sigla'] },
  campus: { names: ['campus'] },
  region: { names: ['regiao'] },
  course: { names: ['curso'] },
  vacancies: { names: ['vagas ofertadas', 'quantidade de vagas', 'vagas'] },
  startMonth: { names: ['data de inicio', 'inicio', 'mes de inicio'] },
};
export const KINDS = Object.freeze({
  interested: { columns: INTERESTED_COLUMNS, required: ['cpf', 'name'] },
  offers: { columns: OFFER_COLUMNS, required: ['institution'] },
});

// Returns { columns: Map<key, number[]>, unmapped, missing }.
export function mapHeaders(kind, headers, overrides = {}) {
  const spec = KINDS[kind];
  const normalized = headers.map(plain);
  const columns = new Map();
  for (const [key, rule] of Object.entries(spec.columns)) {
    const names = rule.names.map(plain);
    const exact = rule.exactFirst
      ? normalized.findIndex((header) => names.some((name) => header === name))
      : -1;
    const matches = normalized.reduce((found, header, index) => {
      if (names.some((name) => header.includes(name))) found.push(index);
      return found;
    }, []);
    // Alias order is priority order: a specific alias ("raca / cor") must win over a
    // broad one ("raca") that also occurs inside unrelated headers ("remuneracao").
    const byPriority = () => {
      for (const name of names) {
        const index = normalized.findIndex((header) => header.includes(name));
        if (index >= 0) return [index];
      }
      return [];
    };
    const picked = exact >= 0 ? [exact] : rule.multi ? matches : byPriority();
    if (picked.length) columns.set(key, picked);
  }
  headers.forEach((header, index) => {
    const wanted = overrides[header];
    if (wanted && spec.columns[wanted]) columns.set(wanted, [index]);
  });
  const used = new Set([...columns.values()].flat());
  return {
    columns,
    unmapped: headers.filter((_, index) => !used.has(index)),
    missing: spec.required.filter((key) => !columns.has(key)),
  };
}

export function parseTimestamp(value) {
  const text = String(value ?? '').trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const parts = br
    ? [br[3], br[2], br[1], br[4] || 0, br[5] || 0, br[6] || 0]
    : text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/)?.slice(1);
  if (!parts) return null;
  const [y, m, d, hh, mm, ss] = parts.map((part) => Number(part ?? 0));
  const date = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  return Number.isNaN(date.getTime()) || date.getUTCMonth() !== m - 1 ? null : date;
}

export function startMonth(value) {
  const date = parseTimestamp(value);
  if (date) return date.toISOString().slice(0, 7);
  const monthYear = String(value ?? '').match(/^(\d{1,2})\/(\d{4})$/);
  return monthYear ? `${monthYear[2]}-${monthYear[1].padStart(2, '0')}` : '';
}

const clean = (value) => String(value ?? '').replace(/^\s+|\s+$/g, '').slice(0, 300);

// Resolved cell values per key (multi keys: first non-empty among matching columns).
function values(columns, cells) {
  const out = {};
  for (const [key, indexes] of columns) {
    out[key] = '';
    for (const index of indexes) {
      const value = clean(cells[index]);
      if (value) {
        out[key] = value;
        break;
      }
    }
  }
  return out;
}

// Every row counts, like the original dashboard (rows without CPF are only flagged
// in the quality counters). CPF/e-mail/phone are not stored; only presence flags.
export function interestedRecord(columns, cells) {
  const raw = values(columns, cells);
  const { submittedAt, cpf, name, course, email, phone, ...fields } = raw;
  return {
    record: {
      cpf: digits(cpf).slice(0, 11),
      name: name || '',
      course: course || '',
      fields: { ...fields, hasEmail: email ? '1' : '', hasPhone: phone ? '1' : '' },
      submittedAt: parseTimestamp(submittedAt) || new Date(),
      submittedText: submittedAt || '',
    },
  };
}

export function offerRecord(columns, cells) {
  const raw = values(columns, cells);
  if (!raw.institution) return { skip: 'missing_institution' };
  const vacancies = Number(String(raw.vacancies || '0').replace(/[^\d]/g, '')) || 0;
  return {
    record: {
      institution: raw.institution,
      campus: raw.campus || '',
      region: raw.region || '',
      course: raw.course || '',
      vacancies: Math.min(vacancies, 1_000_000),
      startMonth: startMonth(raw.startMonth),
    },
  };
}
