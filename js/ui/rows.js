import { escapeHtml } from '../utils/format.js';
import { OT_TYPES } from '../data/presets.js';
import { CURRENCIES } from '../data/defaults.js';
import { otType } from '../core/overtime.js';
import { periodOptions, optionList } from './form.js';
import { itemPeriods } from '../core/periods.js';
import { advanced } from './advanced.js';
import { rateStatus } from './rateFetcher.js';

// ---- field builders ----
const removeBtn = (path, i) => `<button class="btn icon ghost danger" data-del="${path}" data-i="${i}" aria-label="Remove" title="Remove">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;

const text = (path, i, key, value, placeholder = '', { numeric = false, disabled = false, cls = '' } = {}) =>
  `<input type="text" class="${cls}"${numeric ? ' inputmode="decimal"' : ''}${disabled ? ' disabled' : ''} data-path="${path}.${i}.${key}"
    value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder || key)}">`;

const num = (path, i, key, value, placeholder, extra = {}) => text(path, i, key, value, placeholder, { ...extra, numeric: true });

const check = (path, i, key, value, label) =>
  `<label class="check"><input type="checkbox" data-path="${path}.${i}.${key}"${value ? ' checked' : ''} aria-label="${escapeHtml(label || key)}"> ${label}</label>`;

const select = (path, i, key, optionsHtml, cls = '') =>
  `<select class="${cls}" data-path="${path}.${i}.${key}" aria-label="${key}">${optionsHtml}</select>`;

const OT_OPTIONS = [...OT_TYPES.map((t) => ({ value: t.id, label: `${t.label} ×${t.mult}` })), { value: 'custom', label: 'Custom…' }];
const MODE_OPTIONS = [{ value: 'progressive', label: 'Brackets' }, { value: 'flat', label: 'Flat' }];
const LEVY_BASES = [{ value: 'gross', label: 'Gross' }, { value: 'taxable', label: 'Taxable' }];

/** `ctx` carries per-render info: { currency, money, impacts: { overtime: [], cashAwards: [] } }. */
export const ROW_TEMPLATES = {
  incomes: (it, i) => `<div class="item income">
    ${text('incomes', i, 'name', it.name, 'Name')}${num('incomes', i, 'amount', it.amount, 'Amount')}
    ${select('incomes', i, 'per', periodOptions(it.per, itemPeriods('incomes', it)))}${removeBtn('incomes', i)}
    ${advanced('incomes', i, `${check('incomes', i, 'taxable', it.taxable, 'Taxable')}${check('incomes', i, 'insurable', it.insurable, 'Counts toward SI base')}`)}</div>`,

  overtime: (it, i, ctx) => {
    const preset = otType(it.type);
    const impact = ctx.impacts.overtime[i];
    const net = impact && impact.annual > 0
      ? `<div class="impact"><span>${ctx.money((impact.annual / 12) * ctx.factor)} gross</span><b>+ ${ctx.money((impact.netAnnual / 12) * ctx.factor)} net${ctx.factor === 1 ? ' / month' : ''}</b></div>`
      : '';
    return `<div class="item ot">
      ${select('overtime', i, 'type', optionList(OT_OPTIONS, it.type || 'custom'))}
      ${num('overtime', i, 'mult', preset ? preset.mult : it.mult, '×', { disabled: !!preset })}
      ${num('overtime', i, 'hours', it.hours, 'Hours', { cls: 'hrs' })}${removeBtn('overtime', i)}${net}</div>`;
  },

  cashAwards: (it, i, ctx) => {
    const foreign = it.currency !== ctx.currency;
    const currencies = [...new Set([...CURRENCIES, ctx.currency, it.currency])].map((c) => ({ value: c, label: c }));
    const tone = { ok: ' rate-ok', error: ' rate-error' }[rateStatus(i)] ?? '';
    const rateRow = `<div class="flags"><label class="inline">1 ${escapeHtml(it.currency)} = ${num('cashAwards', i, 'rate', it.rate, 'rate', { cls: `xs${tone}` })} ${escapeHtml(ctx.currency)}</label>
      <button type="button" class="btn sm ghost live" data-fetch-rate="${i}" title="Get the current rate online">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>Live rate</button></div>`;
    const impact = ctx.impacts.cashAwards[i];
    const net = impact && impact.annual > 0
      ? `<div class="impact"><span>${ctx.money(impact.annual * ctx.factor)} gross / yr</span><b>${ctx.money(impact.netAnnual * ctx.factor)} net / yr</b></div>`
      : '';
    return `<div class="item award">
      ${text('cashAwards', i, 'name', it.name, 'Name')}${num('cashAwards', i, 'amount', it.amount, 'Amount')}
      ${select('cashAwards', i, 'currency', optionList(currencies, it.currency))}${removeBtn('cashAwards', i)}
      ${foreign ? rateRow : ''}
      ${advanced('cashAwards', i, `${select('cashAwards', i, 'per', periodOptions(it.per, itemPeriods('cashAwards', it)), 'xs-select')}${check('cashAwards', i, 'taxable', it.taxable, 'Taxable')}`)}
      ${net}</div>`;
  },

  deductions: (it, i) => `<div class="item income">
    ${text('deductions', i, 'name', it.name, 'Name')}${num('deductions', i, 'amount', it.amount, 'Amount')}
    ${select('deductions', i, 'per', periodOptions(it.per, itemPeriods('deductions', it)))}${removeBtn('deductions', i)}
    ${advanced('deductions', i, check('deductions', i, 'pretax', it.pretax, 'Before tax (reduces taxable income)'))}</div>`,

  'espp.payrollTax': (e, i) => {
    const p = 'espp.payrollTax';
    return `<tr><td><input type="date" data-path="${p}.${i}.date" value="${escapeHtml(e.date)}" aria-label="Payroll date"></td>
      <td>${num(p, i, 'gains', e.gains, 'gains')}</td><td>${num(p, i, 'tax', e.tax, 'tax')}</td>
      <td>${num(p, i, 'rate', e.rate, 'rate')}</td><td>${removeBtn(p, i)}</td></tr>`;
  },

  '@.tax.brackets': (b, i) => {
    const p = '@.tax.brackets';
    return `<tr><td>${num(p, i, 'rate', b.rate, '%')}</td><td>${num(p, i, 'min', b.min, '0')}</td>
      <td>${num(p, i, 'max', b.max, '∞')}</td><td>${num(p, i, 'exclusion', b.exclusion, 'none')}</td><td>${removeBtn(p, i)}</td></tr>`;
  },

  '@.levies': (l, i) => {
    const p = '@.levies';
    return `<tr><td>${text(p, i, 'name', l.name, 'Name')}</td><td>${num(p, i, 'rate', l.rate, '%')}</td>
      <td>${select(p, i, 'base', optionList(LEVY_BASES, l.base))}</td><td>${removeBtn(p, i)}</td></tr>`;
  },

  '@.si.caps': (c, i) => {
    const p = '@.si.caps';
    return `<tr><td>${num(p, i, 'year', c.year, 'Year')}</td><td>${num(p, i, 'min', c.min, 'none')}</td>
      <td>${num(p, i, 'max', c.max, 'none')}</td><td>${removeBtn(p, i)}</td></tr>`;
  },

  '@.jobTypes': (j, i) => {
    const p = '@.jobTypes';
    return `<tr><td>${text(p, i, 'name', j.name, 'Name')}</td><td>${check(p, i, 'si', j.si, '')}</td>
      <td>${check(p, i, 'exemption', j.exemption, '')}</td><td>${select(p, i, 'mode', optionList(MODE_OPTIONS, j.mode))}</td>
      <td>${num(p, i, 'flatRate', j.flatRate, '%')}</td><td>${removeBtn(p, i)}</td></tr>`;
  },
};
