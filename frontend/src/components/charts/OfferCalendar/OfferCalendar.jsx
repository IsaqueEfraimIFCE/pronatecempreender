import { useMemo, useState } from 'react';

import { ChartEmptyState } from '../../feedback/ChartEmptyState';
import { HelpTooltip } from '../../help/HelpTooltip';
import { formatNumber } from '../../../utils/formatters';

import './OfferCalendar.css';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const UNDATED = 'undated';

// "Ago/2026" -> { year: 2026, month: 7 }; anything else is treated as undated.
function parseMonthLabel(label) {
  const match = /^([A-Za-zçÇ]{3})\/(\d{4})$/.exec(String(label || '').trim());
  if (!match) return null;
  const month = MONTHS.findIndex((name) => name.toLowerCase() === match[1].toLowerCase());
  return month < 0 ? null : { year: Number(match[2]), month };
}

const keyOf = (year, month) => `${year}-${month}`;
const pluralOffers = (count) => `${formatNumber(count)} oferta${count === 1 ? '' : 's'}`;

function groupByInstitution(details) {
  const groups = new Map();
  for (const detail of details) {
    const name = detail.institution || 'Instituição não informada';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(detail);
  }
  return [...groups.entries()]
    .map(([institution, rows]) => ({ institution, rows }))
    .sort(
      (a, b) => b.rows.length - a.rows.length || a.institution.localeCompare(b.institution, 'pt-BR'),
    );
}

// Calendar of offer start dates: one cell per month with the number of offers; selecting
// a month lists the institutions, campuses and courses that start then.
export function OfferCalendar({ title, icon: Icon, items = [], featured = false, help = {} }) {
  const { years, byKey, undated } = useMemo(() => {
    const index = new Map();
    let loose = null;
    for (const item of items) {
      const parsed = parseMonthLabel(item.label);
      if (parsed) {
        index.set(keyOf(parsed.year, parsed.month), { ...item, ...parsed });
      } else {
        loose = loose
          ? {
              ...loose,
              count: loose.count + item.count,
              details: [...loose.details, ...(item.details || [])],
            }
          : { ...item, details: item.details || [] };
      }
    }
    const found = [...new Set([...index.values()].map((entry) => entry.year))].sort((a, b) => a - b);
    return { years: found, byKey: index, undated: loose };
  }, [items]);

  const firstKey = useMemo(() => {
    const dated = [...byKey.values()].sort((a, b) => a.year - b.year || a.month - b.month)[0];
    if (dated) return keyOf(dated.year, dated.month);
    return undated ? UNDATED : null;
  }, [byKey, undated]);

  const [selected, setSelected] = useState(null);
  const selectable = selected === UNDATED ? undated : byKey.get(selected);
  const activeKey = selected && selectable ? selected : firstKey;
  const active = activeKey === UNDATED ? undated : byKey.get(activeKey);

  const max = Math.max(1, ...[...byKey.values()].map((entry) => entry.count), undated?.count || 0);
  const total =
    [...byKey.values()].reduce((sum, entry) => sum + entry.count, 0) + (undated?.count || 0);
  let activeTitle = '';
  if (activeKey === UNDATED) activeTitle = 'Sem data de início';
  else if (active) activeTitle = `${MONTH_NAMES[active.month]} de ${active.year}`;
  const groups = useMemo(() => groupByInstitution(active?.details || []), [active]);

  return (
    <article className={`chart-panel offer-calendar ${featured ? 'featured' : ''}`}>
      <header>
        {Icon ? <Icon size={18} aria-hidden="true" /> : null}
        <h2>{title}</h2>
        <HelpTooltip {...help} />
      </header>

      {total === 0 ? (
        <ChartEmptyState />
      ) : (
        <>
          <p className="offer-calendar-total">
            {pluralOffers(total)} em {formatNumber(years.length)} ano{years.length === 1 ? '' : 's'}
            {undated ? `, ${formatNumber(undated.count)} sem data` : ''}. Selecione um mês para ver
            as instituições.
          </p>

          {years.map((year) => (
            <section className="offer-calendar-year" key={year} aria-label={`Ofertas de ${year}`}>
              <h3>{year}</h3>
              <div className="offer-calendar-grid">
                {MONTHS.map((name, month) => {
                  const key = keyOf(year, month);
                  const entry = byKey.get(key);
                  const count = entry?.count || 0;
                  const isActive = activeKey === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`offer-calendar-cell ${count ? 'has-offers' : 'is-empty'} ${
                        isActive ? 'active' : ''
                      }`}
                      style={{ '--intensity': count / max }}
                      disabled={!count}
                      aria-pressed={isActive}
                      aria-label={`${MONTH_NAMES[month]} de ${year}: ${pluralOffers(count)}`}
                      onClick={() => setSelected(key)}
                    >
                      <span className="offer-calendar-month">{name}</span>
                      <strong>{count ? formatNumber(count) : '—'}</strong>
                      <small>{count ? (count === 1 ? 'oferta' : 'ofertas') : 'sem início'}</small>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {undated ? (
            <button
              type="button"
              className={`offer-calendar-undated ${activeKey === UNDATED ? 'active' : ''}`}
              aria-pressed={activeKey === UNDATED}
              onClick={() => setSelected(UNDATED)}
            >
              Sem data de início <strong>{formatNumber(undated.count)}</strong>
            </button>
          ) : null}

          <div className="offer-calendar-details" aria-live="polite">
            <div className="offer-calendar-details-head">
              <strong>{activeTitle}</strong>
              <span>
                {pluralOffers(active?.count || 0)} · {formatNumber(groups.length)} instituiç
                {groups.length === 1 ? 'ão' : 'ões'}
              </span>
            </div>
            <div className="offer-calendar-groups">
              {groups.map((group) => (
                <section key={group.institution} className="offer-calendar-group">
                  <h4>
                    {group.institution} <span>{pluralOffers(group.rows.length)}</span>
                  </h4>
                  <ul>
                    {group.rows.map((row, index) => (
                      <li key={`${row.campus}-${row.course}-${index}`}>
                        <strong>{row.campus || 'Campus não informado'}</strong>
                        <span>{row.course || 'Curso não informado'}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </article>
  );
}
