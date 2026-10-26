import { $, $$, toast } from '../utils/dom.js';
import { escapeHtml, formatNumber } from '../utils/format.js';
import { monthLabel } from '../core/history.js';
import { getRate } from '../services/exchangeRates.js';
import { getStockPrice } from '../services/stockPrice.js';
import * as store from '../state/store.js';

/** The yellow, lockable columns of the sheet: blank = forecast, a value = actual. */
const LOCKABLE = [
  { key: 'deducted', label: 'Deducted', decimals: 2 },
  { key: 'deductedUsd', label: 'Deducted USD', decimals: 2 },
  { key: 'dividend', label: 'Dividend', decimals: 2 },
  { key: 'shares', label: 'ACC. Shares', decimals: 5 },
];

const fixed = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '');
const usd = (v, d = 2) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// ---------- salary card: compact ESPP block ----------
export function renderEsppInputs(result, money) {
  const tile = $('#esppTile');
  if (!tile) return;
  const e = result?.espp;
  tile.innerHTML = e?.total
    ? `<div><span>Constant</span><b>${money(e.constant / 12)}</b></div>
       <div><span>Variable</span><b>${money(e.variable / 12)}</b></div>
       <div class="tot"><span>Total / month</span><b>${money(e.total / 12)}</b></div>`
    : '<div class="hint">Enter a % above 0 to deduct part of your pay into shares.</div>';
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
    ${tile('Profit', { v: money(rep.toDate.profit), k: `to ${label}` }, { v: money(rep.forecast.profit), k: `${rep.year} forecast` }, 'p')}
    ${tile('Shares', { v: formatNumber2(rep.toDate.shares), k: `to ${label}` }, { v: formatNumber2(rep.forecast.shares), k: `${rep.year} forecast` }, 's')}
  </div>`;
}
const formatNumber2 = (v) => (Number(v) || 0).toFixed(2);

function cell(row, col) {
  const field = row[col.key];
  const shown = fixed(field.value, col.decimals);
  return `<td class="lock${field.locked ? ' on' : ''}">
    <input type="text" inputmode="decimal" data-espp-entry="${row.month}" data-key="${col.key}"
      value="${field.locked ? escapeHtml(shown) : ''}" placeholder="${shown}" aria-label="${col.label} ${row.month}"
      title="${field.locked ? 'Locked actual — clear to forecast' : 'Forecast — type the actual to lock it'}"></td>`;
}

function ledgerTable(rep) {
  const rows = rep.ledger.rows.map((r) => {
    const cls = [r.month > rep.cutoff ? 'future' : '', r.month === rep.cutoff ? 'active' : ''].join(' ');
    return `<tr class="${cls}"><td><b>${monthLabel(r.month).replace(' ' + rep.year, '')}</b></td>
      ${cell(r, LOCKABLE[0])}${cell(r, LOCKABLE[1])}${cell(r, LOCKABLE[2])}
      <td class="r muted-cell">${fixed(r.reinvestFee, 3)}</td><td class="r muted-cell">${fixed(r.feesIn)}</td>
      <td class="r">${fixed(r.accredited)}</td>${cell(r, LOCKABLE[3])}
      <td class="r">${fixed(r.untaxed)}</td><td class="r">${fixed(r.actualShare)}</td></tr>`;
  }).join('');
  const t = rep.forecast;
  return `<div class="table-wrap espp-table"><table class="edit-table">
    <thead><tr><th>Month</th><th class="y">Deducted</th><th class="y">Deducted USD</th><th class="y">Dividend</th>
      <th class="r">Reinvest fee</th><th class="r">Fees in</th><th class="r">Accredited</th><th class="y">ACC. Shares</th>
      <th class="r">Un-taxed</th><th class="r">Actual share</th></tr></thead>
    <tbody>${rows}
      <tr class="total"><td>Total</td><td class="r">${fixed(t.deducted)}</td><td class="r">${fixed(t.deductedUsd)}</td>
        <td class="r">${fixed(t.dividends)}</td><td class="r" colspan="2">${fixed(t.fees)}</td><td></td>
        <td class="r">${fixed(t.shares, 5)}</td><td class="r">${fixed(t.untaxed)}</td><td class="r">${fixed(t.marketValueUsd)}</td></tr>
    </tbody></table></div>
    <p class="hint">Yellow columns: leave blank to forecast, type the actual value to lock it. Months after ${monthLabel(rep.cutoff)} are faded.</p>`;
}

function breakdown(rep, money) {
  const r = (label, a, b) => `<tr><td>${label}</td><td class="r">${a}</td><td class="r">${b}</td></tr>`;
  const d = rep.toDate, f = rep.forecast;
  return `<div class="table-wrap"><table>
    <thead><tr><th></th><th class="r">To ${monthLabel(rep.cutoff)}</th><th class="r">${rep.year} forecast</th></tr></thead>
    <tbody>
      ${r('Deducted from pay', money(d.deducted), money(f.deducted))}
      ${r('Shares held', fixed(d.shares, 5), fixed(f.shares, 5))}
      ${r('Market value', usd(d.marketValueUsd), usd(f.marketValueUsd))}
      ${r('Un-taxed gains', usd(d.untaxed), usd(f.untaxed))}
      ${r('Tax still due', usd(d.taxDueUsd), usd(f.taxDueUsd))}
      ${r('Dividends', usd(d.dividends), usd(f.dividends))}
      ${r('Fees', usd(d.fees), usd(f.fees))}
      <tr class="total"><td>Withdrawal</td><td class="r">${money(d.withdrawal)}</td><td class="r">${money(f.withdrawal)}</td></tr>
      ${r('Profit vs. deducted', money(d.profit), money(f.profit))}
    </tbody></table></div>`;
}

export function renderEsppTab(rep, money) {
  const host = $('[data-view="espp"]');
  if (!host || host.contains(document.activeElement)) return;
  const a = store.getState().espp.assumptions;
  const warn = rep.ready ? ''
    : `<div class="callout warn">Set the <b>share price</b> and <b>USD rate</b> under Assumptions (or press the live buttons) to value the shares.</div>`;
  host.innerHTML = `${warn}${topTiles(rep, money)}
    <div class="row between" style="margin:4px 0 10px">
      <div class="seg" data-espp-year>${[rep.year - 1, rep.year, rep.year + 1]
        .map((y) => `<button data-v="${y}" aria-pressed="${y === rep.year}">${y}</button>`).join('')}</div>
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

export function syncEsppCounts(state) {
  const locked = Object.keys(state.espp.entries).length;
  $$('[data-espp-locked]').forEach((b) => (b.textContent = locked ? String(locked) : ''));
}
