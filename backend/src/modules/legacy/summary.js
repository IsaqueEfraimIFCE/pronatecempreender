import { plain } from './mapping.js';

const UNKNOWN = 'Nao informado';
const LIST_LIMIT = 12;
const LEVEL_LIMIT = 8;

// summary key -> field stored at import. Order mirrors the original dashboard.
const DIMENSIONS = [
  ['byGender', 'gender'],
  ['byEducation', 'education'],
  ['byOccupation', 'occupation'],
  ['byIncome', 'income'],
  ['byRace', 'race'],
  ['byZone', 'zone'],
  ['byStudentStatus', 'studentStatus'],
  ['byOfferingInstitution', 'offeringInstitution'],
  ['byChildren', 'children'],
  ['byBenefit', 'benefit'],
  ['byTraditionalCommunity', 'traditionalCommunity'],
  ['byDisability', 'disability'],
  ['byInternetAccess', 'internetAccess'],
  ['byInternetMode', 'internetMode'],
  ['byDeviceAccess', 'deviceAccess'],
  ['byOwnBusiness', 'ownBusiness'],
  ['byCnpj', 'cnpj'],
  ['byCompanySize', 'companySize'],
  ['byBusinessSector', 'businessSector'],
  ['bySalesChannel', 'salesChannel'],
  ['byBusinessAge', 'businessAge'],
  ['byRevenue', 'revenue'],
  ['byBusinessChallenge', 'businessChallenge'],
  ['bySource', 'source'],
  ['byOtherTraining', 'otherTraining'],
];
const READINESS = [
  ['entrepreneurship', 'entrepreneurshipLevel'],
  ['ai', 'aiLevel'],
  ['digitalTools', 'digitalToolsLevel'],
  ['drones', 'droneExperience'],
  ['apps', 'appDevLevel'],
];
const STATES = {
  AC: ['Acre', 'Norte'],
  AL: ['Alagoas', 'Nordeste'],
  AP: ['Amapa', 'Norte'],
  AM: ['Amazonas', 'Norte'],
  BA: ['Bahia', 'Nordeste'],
  CE: ['Ceara', 'Nordeste'],
  DF: ['Distrito Federal', 'Centro-Oeste'],
  ES: ['Espirito Santo', 'Sudeste'],
  GO: ['Goias', 'Centro-Oeste'],
  MA: ['Maranhao', 'Nordeste'],
  MT: ['Mato Grosso', 'Centro-Oeste'],
  MS: ['Mato Grosso do Sul', 'Centro-Oeste'],
  MG: ['Minas Gerais', 'Sudeste'],
  PA: ['Para', 'Norte'],
  PB: ['Paraiba', 'Nordeste'],
  PR: ['Parana', 'Sul'],
  PE: ['Pernambuco', 'Nordeste'],
  PI: ['Piaui', 'Nordeste'],
  RJ: ['Rio de Janeiro', 'Sudeste'],
  RN: ['Rio Grande do Norte', 'Nordeste'],
  RS: ['Rio Grande do Sul', 'Sul'],
  RO: ['Rondonia', 'Norte'],
  RR: ['Roraima', 'Norte'],
  SC: ['Santa Catarina', 'Sul'],
  SP: ['Sao Paulo', 'Sudeste'],
  SE: ['Sergipe', 'Nordeste'],
  TO: ['Tocantins', 'Norte'],
};

export function items(counts, { sortByLabel = false } = {}) {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) =>
      sortByLabel
        ? a.label.localeCompare(b.label, 'pt-BR')
        : b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'),
    );
}

export function normalizeStateLabel(value) {
  const text = plain(value).toUpperCase();
  if (!text) return '';
  if (STATES[text]) return `${text} - ${STATES[text][0]}`;
  for (const [uf, [name]] of Object.entries(STATES))
    if (text.includes(plain(name).toUpperCase())) return `${uf} - ${name}`;
  return String(value || '').trim();
}

export function regionFromState(label) {
  const text = plain(label).toUpperCase();
  if (!text) return UNKNOWN;
  const uf = text.length >= 2 ? text.slice(0, 2) : text;
  if (STATES[uf]) return STATES[uf][1];
  for (const [, [name, region]] of Object.entries(STATES))
    if (text.includes(plain(name).toUpperCase())) return region;
  return 'Nao identificado';
}

export function ageRange(value) {
  const match = String(value || '')
    .replace(',', '.')
    .match(/\d{1,3}(\.\d+)?/);
  const age = match ? Math.floor(Number(match[0])) : 0;
  if (!age || age < 10 || age > 110) return UNKNOWN;
  if (age <= 17) return 'Ate 17';
  if (age <= 24) return '18 a 24';
  if (age <= 34) return '25 a 34';
  if (age <= 44) return '35 a 44';
  if (age <= 59) return '45 a 59';
  return '60+';
}

// Same as the original: stable, descending by count, first-seen order on ties.
function top(counts, limit) {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
function count(counts, value) {
  const label = String(value || '').trim().replace(/\s+/g, ' ') || UNKNOWN;
  counts.set(label, (counts.get(label) || 0) + 1);
}

// rows: [{ cpfHash, course, fields }]; agreedVacancies: sum of offered vacancies.
export function setecSummary(rows, agreedVacancies = 0) {
  const maps = new Map(
    ['byCourse', 'byCity', 'byState', 'byRegion', 'byAgeRange', ...DIMENSIONS.map(([k]) => k)].map(
      (key) => [key, new Map()],
    ),
  );
  const levels = new Map(READINESS.map(([key]) => [key, new Map()]));
  const seen = new Map();
  const quality = { missingCpf: 0, missingCourse: 0, missingCity: 0, missingEmail: 0, missingPhone: 0 };
  for (const { cpfHash, course, fields = {} } of rows) {
    const state = normalizeStateLabel(fields.state);
    count(maps.get('byCourse'), course);
    count(maps.get('byCity'), fields.city);
    count(maps.get('byState'), state);
    count(maps.get('byRegion'), regionFromState(state));
    count(maps.get('byAgeRange'), ageRange(fields.age));
    for (const [key, field] of DIMENSIONS) count(maps.get(key), fields[field]);
    for (const [key, field] of READINESS)
      if (fields[field]) count(levels.get(key), fields[field]);
    if (cpfHash) seen.set(cpfHash, (seen.get(cpfHash) || 0) + 1);
    else quality.missingCpf += 1;
    if (!course) quality.missingCourse += 1;
    if (!fields.city) quality.missingCity += 1;
    if (!fields.hasEmail) quality.missingEmail += 1;
    if (!fields.hasPhone) quality.missingPhone += 1;
  }
  const summary = {
    totalResponses: rows.length,
    agreedVacancies,
    uniqueCpfs: seen.size,
    duplicateCpfs: [...seen.values()].filter((total) => total > 1).length,
  };
  for (const [key, counts] of maps) summary[key] = top(counts, LIST_LIMIT);
  summary.courseReadiness = Object.fromEntries(
    [...levels].map(([key, counts]) => [key, top(counts, LEVEL_LIMIT)]),
  );
  summary.quality = quality;
  return summary;
}

const group = (offers, label) => {
  const counts = new Map();
  for (const offer of offers) {
    const key = label(offer) || UNKNOWN;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
};
const sum = (offers, label) => {
  const totals = new Map();
  for (const offer of offers) {
    const key = label(offer) || UNKNOWN;
    totals.set(key, (totals.get(key) || 0) + offer.vacancies);
  }
  return totals;
};

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export function monthLabel(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  return match ? `${MONTHS[Number(match[2]) - 1]}/${match[1]}` : key;
}

// Feeds the calendar-like "Início das ofertas por campi" panel: one item per start
// month (chronological, undated last) listing which campus/course starts then.
export function scheduleItems(offers) {
  const byMonth = new Map();
  for (const offer of offers) {
    const key = offer.startMonth || '';
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(offer);
  }
  const keys = [...byMonth.keys()].sort((a, b) =>
    a && !b ? -1 : !a && b ? 1 : a.localeCompare(b),
  );
  return keys.map((key) => {
    const group = byMonth.get(key);
    return {
      label: key ? monthLabel(key) : 'Sem data',
      count: group.length,
      details: group.map((o) => ({
        campus: o.campus,
        course: o.course,
        institution: o.institution,
      })),
    };
  });
}

// offers: [{ institution, campus, region, course, vacancies, startMonth }]
export function coordinationSummary(offers) {
  const institutions = new Set(offers.map((o) => o.institution));
  const regions = new Set(offers.map((o) => o.region).filter(Boolean));
  const campuses = new Set(offers.map((o) => `${o.institution}|${o.campus}`));
  const campusCount = new Map();
  for (const key of campuses) {
    const institution = key.split('|')[0];
    campusCount.set(institution, (campusCount.get(institution) || 0) + 1);
  }
  return {
    totalRecords: offers.length,
    metrics: [
      { label: 'Instituições', value: institutions.size },
      { label: 'Vagas', value: offers.reduce((total, o) => total + o.vacancies, 0) },
      { label: 'Regiões', value: regions.size },
      { label: 'Campi', value: campuses.size },
    ],
    charts: [
      {
        id: 'starts-by-month',
        title: 'Início das ofertas',
        type: 'column',
        items: scheduleItems(offers),
      },
      {
        id: 'region',
        title: 'Ofertas por região',
        type: 'donut',
        items: items(group(offers, (o) => o.region)),
      },
      {
        id: 'vacancies',
        title: 'Vagas por região',
        type: 'column',
        items: items(sum(offers, (o) => o.region)),
      },
      {
        id: 'institutions',
        title: 'Ranking de instituições por vagas',
        items: items(sum(offers, (o) => o.institution)),
      },
      { id: 'campuses', title: 'Campi por instituição', items: items(campusCount) },
      {
        id: 'courses',
        title: 'Ofertas por curso',
        type: 'bar',
        items: items(group(offers, (o) => o.course)),
      },
    ],
  };
}

// Original maskName_: first word kept, every following word reduced to "X.".
export function maskName(name) {
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  if (!first) return '';
  return [first, ...rest.map((word) => `${word.charAt(0).toUpperCase()}.`)].join(' ');
}
