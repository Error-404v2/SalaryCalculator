import { calculate, solveForNet, toAnnual, withImpacts, resolvePayPeriod, proRataInput, esppReport, monthsWithDraft, grossPay } from './core/index.js';
import { toNumber } from './utils/number.js';
import { createMoneyFormatter } from './utils/format.js';
import * as store from './state/store.js';
import { initTabs, syncTabs } from './ui/tabs.js';
import { initBindings, syncBindings, fillSelects } from './ui/form.js';
import { initLists, renderAllLists, setListContext } from './ui/lists.js';
import { initCollapsibles, syncCollapsibles } from './ui/collapsibles.js';
import { initProfiles, syncProfiles } from './ui/profiles.js';
import { initResults, renderResults } from './ui/results/index.js';
import { initSettings, syncSettings } from './ui/settings.js';
import { initSteppers } from './ui/stepper.js';
import { initRateFetcher } from './ui/rateFetcher.js';
import { initEspp, renderEsppInputs, renderEsppTab, resetEsppAdded } from './ui/espp.js';
import { initGainEntries, renderGainEntries } from './ui/esppGains.js';
import { initHistory, renderHistory, placePayForm, syncHistoryBar, showTab } from './ui/history.js';
import { initSaveMonth, syncSaveMonth } from './ui/saveMonth.js';
import { initMonthPickers } from './ui/monthPicker.js';
import { ensureMonthRates, monthRates } from './ui/esppRates.js';
import { initMoneyInputs } from './ui/numberInputs.js';

function compute(input) {
  const amount = toNumber(input.amount);
  if (amount <= 0) return null;
  const result = input.mode === 'net'
    ? solveForNet(input, toAnnual(amount, input.per, input.schedule))
    : calculate(input);
  return withImpacts(input, result);
}

/** The pro-rata result shares the solved basic salary, so Net → Gross stays anchored to a full month. */
function computeProRata(input, full, factor) {
  if (!full || factor === 1) return full;
  const adjusted = proRataInput(input, factor);
  return withImpacts(adjusted, calculate(adjusted, full.baseAnnual));
}

let lastForm = '';

/** `state` is the store's view: the Pay tab, or on the History tab the month being edited. */
function render(state) {
  const input = { ...state, profile: store.activeProfile() };
  const money = createMoneyFormatter(input.profile.currency);
  const result = compute(input);
  const pay = resolvePayPeriod(state.payPeriod);
  pay.result = computeProRata(input, result, pay.factor);

  syncTabs(state);
  placePayForm(state);
  syncSaveMonth(state);
  syncHistoryBar(state);
  syncCollapsibles(state);
  syncBindings(state);
  syncProfiles(state);
  syncSettings(state);
  setListContext({
    currency: input.profile.currency,
    money,
    factor: pay.factor,
    impacts: { overtime: pay.result?.overtime ?? [], cashAwards: pay.result?.cashAwards ?? [] },
  });
  renderResults(result, input, money, pay);
  if (store.scopeMonth() !== lastForm) { lastForm = store.scopeMonth(); resetEsppAdded(); }
  renderEsppInputs(pay.result ?? result, money, state);
  if (state.ui.inTab === 'history') {
    renderHistory(input, money, pay);
    syncCollapsibles(state);
  }
  if (state.ui.resTab === 'espp') {
    // The History month being edited counts as soon as it changes, saved or not.
    const draft = store.scopePay();
    const months = monthsWithDraft(state.months, store.scopeMonth(), draft && grossPay(draft, input), store.scopeDirty());
    // A gain month with no History entry is taxed on the real Pay tab, even while a History month is open.
    const payTab = { ...store.getState(), profile: input.profile };
    const report = esppReport({ ...input, months, payTab, esppRates: monthRates(state) });
    renderEsppTab(report, money);
    renderGainEntries(report, money);
    ensureMonthRates(report.year, rebuild);
  }
}

function rebuild() {
  const state = store.view();
  fillSelects(state);
  renderAllLists();
  render(state);
}

initTabs();
initMonthPickers();
initMoneyInputs();
initBindings();
initLists();
initCollapsibles();
initProfiles(rebuild);
initResults();
initSettings(rebuild);
initSteppers();
initRateFetcher();
initEspp(rebuild);
initGainEntries(rebuild);
initHistory(rebuild);
initSaveMonth(rebuild, (month) => { showTab('history', month); rebuild(); });
store.subscribe(render);
rebuild();
