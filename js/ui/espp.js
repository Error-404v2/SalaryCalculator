import { $, $$, toast } from '../utils/dom.js';
import { escapeHtml, formatNumber } from '../utils/format.js';
import { monthLabel } from '../core/history.js';
import { getRate } from '../services/exchangeRates.js';
import { getStockPrice } from '../services/stockPrice.js';
import * as store from '../state/store.js';
import { toNumber } from '../utils/number.js';

/** The yellow, lockable columns of the sheet: blank = forecast, a value = actual. */
const LOCKABLE = [
  { key: 'deducted', label: 'Deducted', decimals: 2 },
  { key: 'deductedUsd', label: 'Deducted USD', decimals: 2 },
  { key: 'dividend', label: 'Dividend', decimals: 2 },
  { key: 'shares', label: 'ACC. Shares', decimals: 5 },
];

const fixed = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '');
const usd = (v, d = 2) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// ---------- Pay form: Stocks as the first entry of Other deductions ----------
/** Stocks shows once added (+ Stocks / + Add Stocks) or while a % is above 0; it's added per form (Pay or a month). */
let esppAdded = false;
const hasEsppPct = (s) => toNumber(s.espp.constPct) > 0 || toNumber(s.espp.varPct) > 0 || toNumber(s.espp.gain) > 0;
export const esppShown = (s) => esppAdded || hasEsppPct(s);

export function renderEsppInputs(result, money, state) {
  const block = $('#esppBlock');
  if (!block) return;
  const shown = esppShown(state);
  block.hidden = !shown;
  $$('[data-espp-show]').forEach((b) => (b.hidden = shown));
  const count = state.deductions.length + (shown ? 1 : 0);
  $$('[data-deduction-count]').forEach((b) => (b.textContent = count ? String(count) : ''));
  if (!shown) return;
  const e = result?.espp;
  $('#esppTile').innerHTML = e?.total
    ? `<div><span>Constant</span><b>${money(e.constant / 12)}</b></div>
       <div><span>Variable</span><b>${money(e.variable / 12)}</b></div>
       <div class="tot"><span>Total / month</span><b>${money(e.total / 12)}</b></div>`
    : '<div class="hint">Enter a % above 0 to deduct part of your pay into shares.</div>';
  renderGainTile(result, money);
}

/** The ESPP gain is added to taxable pay and then taken back out, so its only cost is the extra tax. */
function renderGainTile(result, money) {
  const tile = $('#esppGainTile');
  const gain = (result?.esppGain ?? 0) / 12;
  tile.hidden = !(gain > 0);
  if (!gain) return;
  const tax = (result.esppGainTax ?? 0) / 12;
  tile.innerHTML = `<div><span>ESPP Gains</span><b>${money(gain)}</b></div>
    <div><span>Extra tax</span><b>${money(tax)}</b></div>
    <div class="tot"><span>Net cost</span><b>${money(tax)}</b></div>`;
}

/** A different form (Pay, or another month) starts without a pending "+ Stocks". */
export function resetEsppAdded() {
  esppAdded = false;
}

// ---------- ESPP tab ----------
function tile(label, a, b, tone = '') {
  return `<div class="etile ${tone}"><div class="k">${label}</div>
    <div class="pair"><div><b>${a.v}</b><small>${a.k}</small></div><div><b>${b.v}</b><small>${b.k}</small></div></div></div>`;
}

function topTiles(rep, money) {
  const label = monthLabel(rep.cutoff);
  return `<div class="etiles">
    ${tile('Withdrawal', { v: money(rep.toDate.withdrawal), k: `to ${label}` }, { v: money(rep.forecast.withdrawal), k: `${rep.year} forecast` }, 'w')}
    ${tile('Profit', { v: money(rep.toDate.profit - rep.toDate.payslipTax), k: `to ${label}` }, { v: money(rep.forecast.profit - rep.forecast.payslipTax), k: `${rep.year} forecast` }, 'p')}
    ${tile('Shares', { v: formatNumber2(rep.toDate.shares), k: `to ${label}` }, { v: formatNumber2(rep.forecast.shares), k: `${rep.year} forecast` }, 's')}
  </div>`;
}
const formatNumber2 = (v) => (Number(v) || 0).toFixed(2);

/** Where a forecast Deducted value comes from, shown as a tooltip and a small mark on the cell. */
function sourceNote(row) {
  const src = row.source;
  if (!src) return '';
  if (src.kind === 'month') return `From History (${monthLabel(src.month)})`;
  return 'From the Pay tab (this month has no History entry)';
}

/** How the grey dividend was worked out: shares held at the record date, less US tax and the reinvest fee. */
function dividendNote(row) {
  if (!row.dividend.value) return 'No dividend this month';
  return `After ${usd(row.dividendTax, 4)} US tax and ${usd(row.reinvestFee, 4)} reinvest fee`;
}

function cell(row, col) {
  const field = row[col.key];
  const shown = fixed(field.value, col.decimals);
  const fromHistory = col.key === 'deducted' && !field.locked && row.source?.kind !== 'pay' && field.value > 0;
  const title = col.key === 'deductedUsd' && row.usedRate
    ? (field.locked
      ? `Your value — IBM used 1 USD = ${row.usedRate.toFixed(4)} that month. Clear it to go back to the calculated one`
      : `Calculated at 1 USD = ${row.rate.toFixed(4)} (${row.rate === row.fxToday ? 'today\'s rate' : 'avg of the 19th–21st'}) — type Equate's USD to override it`)
    : field.locked
      ? 'Your value — clear it to go back to the calculated one'
      : `${col.key === 'deducted' ? sourceNote(row) : col.key === 'dividend' ? dividendNote(row) : 'Calculated'} — type a value to override it`;
  return `<td class="lock${field.locked ? ' on' : ''}${fromHistory ? ' hist' : ''}">
    <input type="text" inputmode="decimal" data-espp-entry="${row.month}" data-key="${col.key}"
      value="${field.locked ? escapeHtml(shown) : ''}" placeholder="${shown}" aria-label="${col.label} ${row.month}"
      title="${escapeHtml(title)}"></td>`;
}

/**
 * Payslip ESPP gain (key 'gain') and the tax it caused (key 'gainTax') for a month: both come from that
 * month's History entry (grey, green dot) and can be typed here to override it, or to track a payslip on its own.
 */
function payslipCell(row, key) {
  const p = row.payslip;
  const typed = key === 'gain' ? p.source === 'typed' : p.taxTyped;
  const calculated = key === 'gain' ? p.gain : p.tax;
  const fromHistory = !typed && p.source === 'history';
  const shown = calculated ? fixed(calculated) : '';
  const what = key === 'gain' ? 'ESPP gain' : 'Tax on the gain';
  const title = typed
    ? 'Your value — clear it to use the History month again'
    : fromHistory
      ? `${what} from History (${monthLabel(row.month)}) — type a value to override it`
      : `No ESPP gain on this payslip — add it on the Pay/History tab, or type the payslip's ${what.toLowerCase()} here`;
  return `<td class="lock${typed ? ' on' : ''}${fromHistory ? ' hist' : ''}${key === 'gainTax' ? ' neg-cell' : ''}">
    <input type="text" inputmode="decimal" data-espp-entry="${row.month}" data-key="${key}"
      value="${typed ? escapeHtml(fixed(calculated)) : ''}" placeholder="${shown || '0.00'}" aria-label="${what} ${row.month}"
      title="${escapeHtml(title)}"></td>`;
}

function ledgerTable(rep) {
  const rows = rep.ledger.rows.map((r) => {
    const cls = [r.month > rep.cutoff ? 'future' : '', r.month === rep.cutoff ? 'active' : ''].join(' ');
    return `<tr class="${cls}"><td><b>${monthLabel(r.month).replace(' ' + rep.year, '')}</b></td>
      ${cell(r, LOCKABLE[0])}${cell(r, LOCKABLE[1])}${cell(r, LOCKABLE[2])}
      <td class="r calc">${fixed(r.reinvestFee, 3)}</td><td class="r calc">${fixed(r.feesIn)}</td>
      <td class="r calc">${fixed(r.accredited)}</td>${cell(r, LOCKABLE[3])}
      <td class="r calc">${fixed(r.untaxed)}</td><td class="r calc">${fixed(r.actualShare)}</td>
      ${payslipCell(r, 'gain')}${payslipCell(r, 'gainTax')}</tr>`;
  }).join('');
  const t = rep.forecast;
  return `<div class="table-wrap espp-table"><table class="edit-table">
    <thead><tr><th>Month</th><th class="y">Deducted</th><th class="y">Deducted USD</th><th class="y">Dividend</th>
      <th class="r">Reinvest fee</th><th class="r">Fees in</th><th class="r">Accredited</th><th class="y">ACC. Shares</th>
      <th class="r" title="Discount on shares bought this month">Discount gain</th><th class="r">Actual share</th>
      <th class="y" title="ESPP gain on this month's payslip, EGP">Payslip gain</th><th class="y" title="Extra income tax the payslip gain caused, EGP">Gain tax</th></tr></thead>
    <tbody>${rows}
      <tr class="total"><td>Total</td><td class="r">${fixed(t.deducted)}</td><td class="r">${fixed(t.deductedUsd)}</td>
        <td class="r">${fixed(t.dividends)}</td><td class="r" colspan="2">${fixed(t.fees)}</td><td></td>
        <td class="r">${fixed(t.shares, 5)}</td><td class="r">${fixed(t.untaxed)}</td><td class="r">${fixed(t.marketValueUsd)}</td>
        <td class="r">${fixed(t.payslipGain)}</td><td class="r">${fixed(t.payslipTax)}</td></tr>
    </tbody></table></div>
    <p class="hint">Yellow columns show the calculated value in grey; type a value to override it, clear it to go back.
      <span class="hist-dot"></span> Deducted, Payslip gain and its tax come from that month's History entry. Months after ${monthLabel(rep.cutoff)} are faded.</p>`;
}

function breakdown(rep, money) {
  const r = (label, a, b, tone = '') => `<tr class="${tone}"><td>${label}</td><td class="r">${a}</td><td class="r">${b}</td></tr>`;
  const cost = (v, fmt) => (v ? `− ${fmt(v)}` : fmt(0));
  const d = rep.toDate, f = rep.forecast;
  // Profit after every cost that isn't coming back: the tax the payslip gains caused is also paid out of pocket.
  const net = (x) => x.profit - x.payslipTax;
  return `<div class="table-wrap"><table class="espp-sum">
    <thead><tr><th></th><th class="r">To ${monthLabel(rep.cutoff)}</th><th class="r">${rep.year} forecast</th></tr></thead>
    <tbody>
      ${r('Deducted from pay', money(d.deducted), money(f.deducted))}
      ${r('Shares held', fixed(d.shares, 5), fixed(f.shares, 5))}
      ${r('Market value', usd(d.marketValueUsd), usd(f.marketValueUsd), 'pos-row')}
      ${r('Discount gain <span class="hint">taxed via payroll</span>', usd(d.untaxed), usd(f.untaxed))}
      ${r('Dividends <span class="hint">after US tax and fee</span>', usd(d.dividends), usd(f.dividends))}
      ${r('Dividend US tax', cost(d.dividendTax, usd), cost(f.dividendTax, usd), 'neg-row')}
      ${r('Fees <span class="hint">admin + reinvest</span>', cost(d.fees, usd), cost(f.fees, usd), 'neg-row')}
      ${r('Withdrawal fee', cost(d.withdrawalFee, usd), cost(f.withdrawalFee, usd), 'neg-row')}
      ${r('Tax on payslip gains', cost(d.payslipTax, money), cost(f.payslipTax, money), 'neg-row')}
      <tr class="total"><td>Withdrawal</td><td class="r">${money(d.withdrawal)}</td><td class="r">${money(f.withdrawal)}</td></tr>
      ${r('Profit <span class="hint">after all costs</span>', money(net(d)), money(net(f)), 'pos-row')}
    </tbody></table></div>
    <p class="hint">Red = money that never comes back. Fees and dividend tax are already inside <b>Shares held</b>, so they are not taken off again; the withdrawal fee is taken off the withdrawal, and the tax on payslip gains is taken off the profit.</p>`;
}

export function renderEsppTab(rep, money) {
  const host = $('[data-view="espp"]');
  if (!host) return;
  // Only wait while a field is being typed in; a pressed button (e.g. a year) must redraw straight away.
  const focused = document.activeElement;
  if (host.contains(focused) && focused.tagName === 'INPUT') return;
  const a = store.getState().espp.assumptions;
  const warn = rep.ready ? ''
    : `<div class="callout warn">Set the <b>share price</b> and <b>USD rate</b> under Assumptions (or press the live buttons) to value the shares.</div>`;
  host.innerHTML = `${warn}${topTiles(rep, money)}
    <div class="row between" style="margin:4px 0 10px">
      <div class="seg" data-espp-year>${[rep.year - 1, rep.year, rep.year + 1]
        .map((y) => `<button type="button" data-v="${y}" aria-pressed="${y === rep.year}" aria-label="${y === rep.year ? `${y} (shown)` : `Show ${y}`}">${y}</button>`).join('')}</div>
      <span class="hint">Price ${a.price ? usd(a.price) : '—'} · 1 USD = ${a.fx || '—'}</span>
    </div>
    ${breakdown(rep, money)}
    <div class="spacer"></div>
    ${ledgerTable(rep)}`;
}

// ---------- live price / FX ----------
async function fetchLive(kind, button) {
  const input = $(`[data-bind="espp.assumptions.${kind}"]`);
  button.classList.add('loading');
  button.disabled = true;
  try {
    const value = kind === 'price'
      ? (await getStockPrice(store.getState().espp.symbol)).price
      : (await getRate('USD', store.activeProfile().currency)).rate;
    store.set(`espp.assumptions.${kind}`, String(Number(value.toFixed(4))));
    input.classList.add('rate-ok');
    input.classList.remove('rate-error');
    input.title = 'Live value';
  } catch (err) {
    input.classList.add('rate-error');
    input.classList.remove('rate-ok');
    input.title = `Could not fetch (${err.message}). Enter it manually.`;
    toast('Live value unavailable — enter it manually');
  } finally {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

export function initEspp(onChanged) {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-espp-show]')) {
      esppAdded = true;
      onChanged();
      $('#esppBlock input')?.focus();
      return;
    }
    if (e.target.closest('[data-espp-remove]')) {
      esppAdded = false;
      store.set('espp.constPct', '');
      store.set('espp.varPct', '');
      store.set('espp.gain', '');
      return onChanged();
    }
    const live = e.target.closest('[data-espp-live]');
    if (live) return fetchLive(live.dataset.esppLive, live);
    const year = e.target.closest('[data-espp-year] button');
    if (year) store.set('ui.esppYear', year.dataset.v);
  });

  document.addEventListener('input', (e) => {
    const month = e.target.dataset.esppEntry;
    if (month) {
      const key = e.target.dataset.key;
      store.update((s) => {
        const row = { ...(s.espp.entries[month] ?? {}) };
        if (e.target.value.trim()) row[key] = e.target.value.trim(); else delete row[key];
        if (Object.keys(row).length) s.espp.entries[month] = row; else delete s.espp.entries[month];
      });
      return;
    }
    const bind = e.target.dataset.bind ?? '';
    if (bind === 'espp.assumptions.price' || bind === 'espp.assumptions.fx') e.target.classList.remove('rate-ok', 'rate-error');
  });

  document.addEventListener('focusout', (e) => {
    if (e.target.dataset.esppEntry) setTimeout(onChanged);
  });
}

