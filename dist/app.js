(() => {
  // js/utils/number.js
  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const n = parseFloat(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  function isFilled(value) {
    if (value === null || value === void 0) return false;
    const s = String(value).replace(/,/g, "").trim();
    return s !== "" && Number.isFinite(parseFloat(s));
  }
  function stepValue(current, delta, min = 0, max = Infinity) {
    const next = toNumber(current) + delta;
    return Math.min(max, Math.max(min, Math.round(next * 100) / 100));
  }
  var sum = (list, pick2 = (x) => x) => list.reduce((acc, x) => acc + pick2(x), 0);

  // js/core/periods.js
  var PERIODS = [
    { id: "year", label: "Annual", unit: "year" },
    { id: "month", label: "Monthly", unit: "month" },
    { id: "day", label: "Daily", unit: "day" },
    { id: "hour", label: "Hourly", unit: "hour" }
  ];
  var ITEM_PERIODS = [
    { id: "once", label: "One-Time" },
    { id: "year", label: "Annual" },
    { id: "half", label: "Bi-annual" },
    { id: "quarter", label: "Quarterly" },
    { id: "month", label: "Monthly" },
    { id: "day", label: "Daily" },
    { id: "hour", label: "Hourly" }
  ];
  var isPeriod = (id) => PERIODS.some((p) => p.id === id);
  var isItemPeriod = (id) => ITEM_PERIODS.some((p) => p.id === id);
  var PERIOD_SETS = {
    occasional: ["once", "half", "quarter"],
    recurring: ["month", "year"],
    deduction: ["month", "quarter", "half", "year"]
  };
  function itemPeriods(list, item = {}) {
    const name = String(item.name ?? "").toLowerCase();
    const recurring = name.startsWith("transport") || name.startsWith("medical");
    const set2 = recurring ? PERIOD_SETS.recurring : list === "deductions" ? PERIOD_SETS.deduction : PERIOD_SETS.occasional;
    const ids = item.per && !set2.includes(item.per) && isItemPeriod(item.per) ? [...set2, item.per] : set2;
    return ids.map((id) => ITEM_PERIODS.find((p) => p.id === id));
  }
  var findPeriod = (id) => PERIODS.find((p) => p.id === id) ?? PERIODS[1];
  function periodsPerYear(periodId, schedule = {}) {
    const weeks = toNumber(schedule.weeksPerYear) || 52;
    const days = toNumber(schedule.daysPerWeek) || 5;
    const hours = toNumber(schedule.hoursPerDay) || 8;
    const table = {
      // One-Time counts in full in the month it is paid (the month on the Pay tab), not spread over the year.
      once: 12,
      year: 1,
      half: 2,
      quarter: 4,
      month: 12,
      day: weeks * days,
      hour: weeks * days * hours
    };
    return table[periodId] ?? 12;
  }
  var toAnnual = (amount, periodId, schedule) => toNumber(amount) * periodsPerYear(periodId, schedule);
  function fromAnnual(annual, periodId, schedule, payFactor = 1) {
    const value = annual / periodsPerYear(periodId, schedule);
    return periodId === "month" ? value * payFactor : value;
  }
  var DAYS_PER_MONTH = 30;
  function describePayPeriod(months, days) {
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const parts = [];
    if (months) parts.push(plural(months, "month"));
    if (days) parts.push(`${days < 0 ? "\u2212 " : months ? "+ " : ""}${plural(Math.abs(days), "day")}`);
    return parts.join(" ") || "No pay";
  }
  function resolvePayPeriod(payPeriod = {}) {
    const months = toNumber(payPeriod.months);
    const days = toNumber(payPeriod.days);
    const factor = Math.max(0, months + days / DAYS_PER_MONTH);
    const standard = factor === 1;
    return {
      factor,
      standard,
      unit: standard ? "month" : "pay period",
      label: standard ? "Monthly" : describePayPeriod(months, days),
      monthly: (annual) => annual / 12 * factor
    };
  }

  // js/core/incomeTax.js
  function normalizeBrackets(brackets = []) {
    return brackets.map((b) => ({
      rate: toNumber(b.rate),
      min: toNumber(b.min),
      max: isFilled(b.max) ? toNumber(b.max) : Infinity,
      exclusion: isFilled(b.exclusion) ? toNumber(b.exclusion) : null
    })).sort((a, b) => a.min - b.min);
  }
  function computeIncomeTax(taxableAnnual, brackets) {
    const list = normalizeBrackets(brackets);
    const lastExcluded = list.reduce(
      (cut, b, i) => b.exclusion !== null && taxableAnnual > b.exclusion ? i : cut,
      -1
    );
    let total = 0;
    let marginalRate = 0;
    const rows = list.map((b, i) => {
      const excluded = i <= lastExcluded;
      const from = i === lastExcluded + 1 ? 0 : b.min;
      const width = Math.max(0, b.max - from);
      const portion = excluded ? 0 : Math.min(Math.max(taxableAnnual - from, 0), width);
      const tax = portion * b.rate / 100;
      total += tax;
      if (portion > 0) marginalRate = b.rate;
      return { ...b, from, excluded, portion, tax };
    });
    return { total, marginalRate, rows };
  }
  function validateBrackets(brackets) {
    const list = normalizeBrackets(brackets);
    const issues = [];
    list.forEach((b, i) => {
      if (b.max <= b.min) issues.push(`${b.rate}% bracket: "To" must be greater than "From".`);
      const prev = list[i - 1];
      if (prev && prev.max !== b.min) issues.push(`Gap or overlap between ${prev.max} and ${b.min}.`);
    });
    return issues;
  }

  // js/core/socialInsurance.js
  function computeSocialInsurance({ si = {}, baseOverride, year, enabled, insurableMonthly }) {
    const rawBase = isFilled(baseOverride) ? toNumber(baseOverride) : insurableMonthly;
    const cap = (si.caps ?? []).find((c) => String(c.year) === String(year));
    let base = rawBase;
    if (cap && isFilled(cap.max)) base = Math.min(base, toNumber(cap.max));
    if (cap && isFilled(cap.min) && base > 0) base = Math.max(base, toNumber(cap.min));
    const annualAt = (rate) => enabled ? base * (toNumber(rate) / 100) * 12 : 0;
    return {
      enabled,
      rawBase,
      base,
      capped: base !== rawBase,
      employee: annualAt(si.employeeRate),
      employer: annualAt(si.employerRate)
    };
  }

  // js/data/presets.js
  var OT_TYPES = [
    { id: "holiday", label: "Holiday", mult: "2" },
    { id: "restday", label: "Rest day", mult: "1.7" },
    { id: "weekday", label: "Weekday", mult: "1.35" },
    { id: "regular", label: "Regular", mult: "1" },
    { id: "night", label: "Night shift", mult: "0.09" }
  ];
  var PRESETS = {
    incomes: [
      { name: "Transportation", amount: "1000", per: "month", taxable: true, insurable: false },
      { name: "Profit share (GDP)", amount: "", per: "once", taxable: false, insurable: false },
      { name: "Bonus", amount: "", per: "once", taxable: true, insurable: false }
    ],
    deductions: [
      { name: "Medical insurance", amount: "", per: "month", pretax: false },
      { name: "Pension plan", amount: "", per: "month", pretax: true },
      { name: "Loan", amount: "", per: "month", pretax: false }
    ]
  };
  var BLANK_ROWS = {
    incomes: { name: "", amount: "", per: "once", taxable: true, insurable: false },
    cashAwards: { name: "Cash Award", amount: "", currency: "USD", rate: "", per: "once", taxable: true },
    deductions: { name: "", amount: "", per: "month", pretax: false },
    "espp.payrollTax": { date: "", gains: "", tax: "", rate: "" },
    "@.tax.brackets": { rate: "", min: "", max: "", exclusion: "" },
    "@.levies": { name: "", rate: "", base: "gross" },
    "@.si.caps": { year: "", min: "", max: "" },
    "@.jobTypes": { name: "New type", si: true, exemption: true, mode: "progressive", flatRate: "" }
  };

  // js/core/overtime.js
  var otType = (id) => OT_TYPES.find((t) => t.id === id);
  var multiplierOf = (item) => toNumber(otType(item.type)?.mult ?? item.mult);
  function overtimeLabel(item) {
    const type = otType(item.type);
    return type ? `${type.label} \xD7${type.mult}` : `Custom \xD7${toNumber(item.mult)}`;
  }
  function sortOvertime(list) {
    const rank = (item) => {
      const index = OT_TYPES.findIndex((t) => t.id === item.type);
      return index === -1 ? OT_TYPES.length : index;
    };
    return list.sort((a, b) => rank(a) - rank(b) || multiplierOf(b) - multiplierOf(a));
  }
  function nextOvertimeType(list) {
    const used = new Set(list.map((item) => item.type));
    return OT_TYPES.find((t) => !used.has(t.id)) ?? null;
  }

  // js/core/calculator.js
  var FALLBACK_JOB = { si: true, exemption: true, mode: "progressive", flatRate: 0 };
  var findJob = (profile, jobType) => profile.jobTypes?.find((j) => j.id === jobType) ?? profile.jobTypes?.[0] ?? FALLBACK_JOB;
  var exchangeRate = (award, localCurrency) => award.currency === localCurrency ? 1 : toNumber(award.rate);
  function annualizeIncomes(incomes, schedule) {
    return incomes.map((it) => ({
      name: it.name || "Allowance",
      annual: toAnnual(it.amount, it.per || "month", schedule),
      taxable: it.taxable !== false,
      insurable: !!it.insurable
    }));
  }
  function annualizeOvertime(overtime, hourlyRate) {
    return overtime.map((o) => ({
      label: overtimeLabel(o),
      annual: hourlyRate * multiplierOf(o) * toNumber(o.hours) * 12
    }));
  }
  function annualizeCashAwards(awards, currency, schedule) {
    return awards.map((a) => {
      const per = a.per || "year";
      const rate = exchangeRate(a, currency);
      return {
        name: a.name || "Cash award",
        per,
        annual: toAnnual(toNumber(a.amount) * rate, per, schedule),
        taxable: a.taxable !== false,
        missingRate: toNumber(a.amount) > 0 && !(rate > 0)
      };
    });
  }
  function annualizeDeductions(deductions, schedule) {
    return deductions.map((d) => ({
      name: d.name || "Deduction",
      annual: toAnnual(d.amount, d.per || "month", schedule),
      pretax: !!d.pretax
    }));
  }
  function computeEspp(espp, parts) {
    if (!espp?.enabled) return { constant: 0, variable: 0, total: 0, constBase: 0, varBase: 0 };
    const v = espp.variable ?? {};
    const varBase = (v.allowances ? parts.taxableAllowances : 0) + (v.exempt ? parts.exemptAllowances : 0) + (v.overtime ? parts.overtimeAnnual : 0) + (v.cashAwards ? parts.cashAwardsAnnual : 0);
    const constant = parts.baseAnnual * toNumber(espp.constPct) / 100;
    const variable = varBase * toNumber(espp.varPct) / 100;
    return { constant, variable, total: constant + variable, constBase: parts.baseAnnual, varBase };
  }
  function computeLevies(levies, grossAnnual, taxableAnnual) {
    return levies.map((l) => {
      const rate = toNumber(l.rate);
      const base = l.base === "taxable" ? taxableAnnual : grossAnnual;
      return { name: l.name || "Levy", rate, base: l.base, annual: base * rate / 100 };
    });
  }
  function calculate(input, baseAnnualOverride) {
    const { profile, schedule = {}, overrides = {} } = input;
    const job = findJob(profile, input.jobType);
    const baseAnnual = baseAnnualOverride ?? toAnnual(input.amount, input.per, schedule);
    const otHoursBase = toNumber(schedule.otHoursBase);
    const hourlyRate = otHoursBase > 0 ? baseAnnual / 12 / otHoursBase : 0;
    const incomes = annualizeIncomes(input.incomes ?? [], schedule);
    const overtime = annualizeOvertime(input.overtime ?? [], hourlyRate);
    const cashAwards = annualizeCashAwards(input.cashAwards ?? [], profile.currency, schedule);
    const deductions = annualizeDeductions(input.deductions ?? [], schedule);
    const extras = [...incomes, ...cashAwards];
    const taxableExtras = sum(extras.filter((i) => i.taxable), (i) => i.annual);
    const exemptAllowances = sum(extras.filter((i) => !i.taxable), (i) => i.annual);
    const insurableAllowances = sum(incomes.filter((i) => i.insurable), (i) => i.annual);
    const overtimeAnnual = sum(overtime, (o) => o.annual);
    const preTax = sum(deductions.filter((d) => d.pretax), (d) => d.annual);
    const postTax = sum(deductions.filter((d) => !d.pretax), (d) => d.annual);
    const grossTaxable = baseAnnual + taxableExtras + overtimeAnnual;
    const grossAnnual = grossTaxable + exemptAllowances;
    const si = computeSocialInsurance({
      si: profile.si,
      baseOverride: overrides.siBase,
      year: input.year,
      enabled: !!job.si,
      insurableMonthly: (baseAnnual + insurableAllowances) / 12
    });
    const exemption = job.exemption ? toNumber(profile.tax?.exemption) : 0;
    const autoTaxable = Math.max(0, grossTaxable - si.employee - exemption - preTax);
    const overridden = isFilled(overrides.taxable);
    const taxableAnnual = overridden ? Math.max(0, toAnnual(overrides.taxable, overrides.taxablePer || "month", schedule)) : autoTaxable;
    const flat = job.mode === "flat";
    const progressive = flat ? null : computeIncomeTax(taxableAnnual, profile.tax?.brackets);
    const marginalRate = flat ? toNumber(job.flatRate) : progressive.marginalRate;
    const incomeTax = flat ? taxableAnnual * marginalRate / 100 : progressive.total;
    const levies = computeLevies(profile.levies ?? [], grossAnnual, taxableAnnual);
    const leviesTotal = sum(levies, (l) => l.annual);
    const espp = computeEspp(input.espp, {
      baseAnnual,
      taxableAllowances: sum(incomes.filter((i) => i.taxable), (i) => i.annual),
      exemptAllowances: sum(incomes.filter((i) => !i.taxable), (i) => i.annual),
      overtimeAnnual,
      cashAwardsAnnual: sum(cashAwards, (a) => a.annual)
    });
    const totalDeductions = si.employee + incomeTax + leviesTotal + preTax + postTax + espp.total;
    const net = grossAnnual - totalDeductions;
    const employeeGovTake = si.employee + incomeTax + leviesTotal;
    const employerCost = grossAnnual + si.employer;
    const ratio = (a, b) => b > 0 ? a / b : 0;
    return {
      job,
      baseAnnual,
      hourlyRate,
      incomes,
      overtime,
      cashAwards,
      deductions,
      overtimeAnnual,
      exemptAllowances,
      grossAnnual,
      grossTaxable,
      si,
      exemption,
      preTax,
      postTax,
      autoTaxable,
      taxableAnnual,
      overridden,
      flat,
      incomeTax,
      marginalRate,
      bracketRows: progressive?.rows ?? [],
      levies,
      leviesTotal,
      espp,
      totalDeductions,
      net,
      employeeGovTake,
      employerCost,
      avgTaxRate: ratio(incomeTax, grossAnnual),
      realTaxRate: ratio(employeeGovTake + si.employer, employerCost)
    };
  }

  // js/core/solver.js
  function solveForNet(cfg, targetNetAnnual) {
    const netAt = (base) => calculate(cfg, base).net;
    let lo = 0;
    let hi = Math.max(targetNetAnnual * 2, 1e3);
    for (let i = 0; i < 60 && netAt(hi) < targetNetAnnual; i++) hi *= 2;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (netAt(mid) < targetNetAnnual) lo = mid;
      else hi = mid;
    }
    return { ...calculate(cfg, hi), solved: true, targetNet: targetNetAnnual };
  }

  // js/core/impacts.js
  function allocate(items, groupNet) {
    const gross = sum(items, (i) => i.annual);
    return items.map((i) => ({ ...i, netAnnual: gross > 0 ? groupNet * i.annual / gross : 0 }));
  }
  function withImpacts(input, result) {
    const netWithout = (patch) => calculate({ ...input, ...patch }, result.baseAnnual).net;
    const overtimeNet = result.overtimeAnnual > 0 ? result.net - netWithout({ overtime: [] }) : 0;
    const hasAwards = result.cashAwards.some((a) => a.annual > 0);
    const cashAwardsNet = hasAwards ? result.net - netWithout({ cashAwards: [] }) : 0;
    return {
      ...result,
      overtimeNet,
      cashAwardsNet,
      overtime: allocate(result.overtime, overtimeNet),
      cashAwards: allocate(result.cashAwards, cashAwardsNet)
    };
  }

  // js/core/proRata.js
  function proRataInput(input, factor) {
    if (factor === 1 || factor <= 0) return input;
    return {
      ...input,
      overtime: (input.overtime ?? []).map((o) => ({ ...o, hours: String(toNumber(o.hours) / factor) })),
      cashAwards: (input.cashAwards ?? []).map((a) => ({ ...a, amount: String(toNumber(a.amount) / factor) }))
    };
  }

  // js/core/history.js
  var HISTORY_FIELDS = [
    { id: "salary", label: "Gross salary", unit: "money" },
    { id: "transport", label: "Transportation", unit: "money" },
    { id: "medical", label: "Medical insurance", unit: "money" },
    { id: "esppConst", label: "ESPP % (constant)", unit: "pct" },
    { id: "esppVar", label: "ESPP % (variable)", unit: "pct" }
  ];
  var historyField = (id) => HISTORY_FIELDS.find((f) => f.id === id);
  var monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  function monthLabel(key2, style = "short") {
    const [y, m] = key2.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: style, year: "numeric" });
  }
  var monthsOfYear = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  var monthIndex = (key2) => {
    const [y, m] = key2.split("-").map(Number);
    return y * 12 + m;
  };
  function nearestFirst(months, from) {
    const at = monthIndex(from);
    return [...months].sort((a, b) => Math.abs(monthIndex(a) - at) - Math.abs(monthIndex(b) - at) || b.localeCompare(a));
  }
  function entryAt(history, field, month) {
    let best = null;
    for (const entry of history ?? []) {
      if (entry.field !== field || !entry.from || !isFilled(entry.value)) continue;
      if (entry.from <= month && (!best || entry.from >= best.from)) best = entry;
    }
    return best;
  }
  function valueAt(history, field, month, fallback = "") {
    const best = entryAt(history, field, month);
    return best ? best.value : fallback;
  }
  function monthsInHistory(history) {
    const months = /* @__PURE__ */ new Set();
    for (const entry of history ?? []) {
      if (historyField(entry.field) && entry.from) months.add(entry.from);
    }
    return [...months].sort((a, b) => b.localeCompare(a));
  }
  function monthSnapshot(history, month) {
    return HISTORY_FIELDS.map((field) => {
      const entry = entryAt(history, field.id, month);
      return { ...field, value: entry ? entry.value : "", from: entry ? entry.from : "", exact: !!entry && entry.from === month };
    });
  }
  function monthValues(history, month) {
    return Object.fromEntries(monthSnapshot(history, month).map((f) => [f.id, f.value]));
  }
  function savedMonths(history) {
    return monthsInHistory(history).map((month) => ({
      month,
      fields: HISTORY_FIELDS.filter((f) => (history ?? []).some((e) => e.field === f.id && e.from === month && isFilled(e.value))).map((f) => f.id)
    }));
  }
  var hasMonth = (history, month) => (history ?? []).some((e) => e.from === month && historyField(e.field) && isFilled(e.value));
  var removeMonth = (history, month) => (history ?? []).filter((e) => e.from !== month);
  function saveMonth(history, month, values) {
    const all = history ?? [];
    const kept = all.filter((e) => !(e.from === month && historyField(e.field)));
    const added = HISTORY_FIELDS.filter((f) => isFilled(values?.[f.id])).map((f) => ({ field: f.id, from: month, value: String(values[f.id]) }));
    return { history: [...kept, ...added], replaced: all.length - kept.length, saved: added.length };
  }

  // js/core/espp.js
  var DIVIDEND_MONTHS = /* @__PURE__ */ new Set([3, 6, 9, 12]);
  var FEE_MONTHS = /* @__PURE__ */ new Set([1, 7]);
  var monthNumber = (key2) => Number(key2.slice(5, 7));
  var pick = (locked, forecast) => isFilled(locked) ? { value: toNumber(locked), locked: true } : { value: forecast, locked: false };
  function buildLedger({ year, entries = {}, assumptions = {}, deductionFor }) {
    const price = toNumber(assumptions.price);
    const discount = toNumber(assumptions.discount) / 100;
    const purchasePrice = price * (1 - discount);
    const fx = toNumber(assumptions.fx);
    const dividendPerShare = toNumber(assumptions.dividend);
    const reinvestRate = toNumber(assumptions.reinvestRate) / 100;
    const reinvestCap = toNumber(assumptions.reinvestCap);
    const feeIn = toNumber(assumptions.feeIn);
    let shares = 0;
    const sharesHistory = [];
    const rows = monthsOfYear(year).map((month, i) => {
      const entry = entries[month] ?? {};
      const m = monthNumber(month);
      const deducted = pick(entry.deducted, deductionFor(month));
      const deductedUsd = pick(entry.deductedUsd, fx > 0 ? deducted.value / fx : 0);
      const eligibleShares = sharesHistory[i - 2] ?? 0;
      const dividend = pick(entry.dividend, DIVIDEND_MONTHS.has(m) ? Math.floor(eligibleShares * dividendPerShare * 100) / 100 : 0);
      const reinvestFee = dividend.value > 0 ? Math.min(dividend.value * reinvestRate, reinvestCap) : 0;
      const feesIn = FEE_MONTHS.has(m) ? feeIn : 0;
      const accredited = deductedUsd.value + dividend.value - reinvestFee - feesIn;
      const previous = shares;
      const accShares = pick(entry.shares, purchasePrice > 0 ? previous + accredited / purchasePrice : previous);
      shares = accShares.value;
      sharesHistory.push(shares);
      const added = shares - previous;
      const actualShare = added * price;
      const untaxed = actualShare - accredited;
      const hasActivity = deducted.value > 0 || accredited !== 0 || added !== 0;
      return {
        month,
        deducted,
        deductedUsd,
        dividend,
        reinvestFee,
        feesIn,
        accredited,
        shares: accShares,
        added,
        actualShare,
        untaxed,
        hasActivity,
        locked: deducted.locked || deductedUsd.locked || dividend.locked || accShares.locked
      };
    });
    return { rows, price, purchasePrice, fx };
  }
  function summarize(ledger, { cutoff, assumptions = {}, payrollTaxUsd = 0 }) {
    const rows = cutoff ? ledger.rows.filter((r) => r.month <= cutoff) : ledger.rows;
    const last = rows.at(-1);
    const shares = last ? last.shares.value : 0;
    const deducted = sum(rows, (r) => r.deducted.value);
    const deductedUsd = sum(rows, (r) => r.deductedUsd.value);
    const untaxed = sum(rows, (r) => r.untaxed);
    const dividends = sum(rows, (r) => r.dividend.value);
    const fees = sum(rows, (r) => r.reinvestFee + r.feesIn);
    const taxRate = toNumber(assumptions.taxRate) / 100;
    const withdrawalFee = toNumber(assumptions.withdrawalFee);
    const taxDueUsd = Math.max(0, taxRate * untaxed - payrollTaxUsd);
    const marketValueUsd = shares * ledger.price;
    const withdrawalUsd = Math.max(0, marketValueUsd - withdrawalFee - taxDueUsd);
    const withdrawal = withdrawalUsd * ledger.fx;
    return {
      months: rows.length,
      shares,
      deducted,
      deductedUsd,
      untaxed,
      dividends,
      fees,
      marketValueUsd,
      taxDueUsd,
      withdrawalUsd,
      withdrawal,
      profit: withdrawal - deducted,
      netGainsUsd: untaxed - taxDueUsd - withdrawalFee
    };
  }
  function payrollTax(events = []) {
    return events.reduce(
      (acc, e) => {
        const rate = toNumber(e.rate);
        const tax = toNumber(e.tax);
        const gains = toNumber(e.gains);
        acc.tax += tax;
        acc.taxUsd += rate > 0 ? tax / rate : 0;
        acc.gainsUsd += rate > 0 ? gains / rate : 0;
        return acc;
      },
      { tax: 0, taxUsd: 0, gainsUsd: 0 }
    );
  }
  function adjustedMonth(today, changeDay, offset = 0) {
    const settledThisMonth = today.getDate() >= toNumber(changeDay || 1);
    const shift = (settledThisMonth ? 0 : -1) + toNumber(offset);
    const d = new Date(today.getFullYear(), today.getMonth() + shift, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // js/core/esppForecast.js
  function inputForMonth(input, month, forEspp = false) {
    const h = input.history;
    const amount = valueAt(h, "salary", month, input.amount);
    const swap = (list, name, field) => list.map((it) => it.name?.toLowerCase().startsWith(name) ? { ...it, amount: valueAt(h, field, month, it.amount) } : it);
    return {
      ...input,
      amount,
      per: isFilled(valueAt(h, "salary", month, "")) ? "month" : input.per,
      incomes: swap(input.incomes ?? [], "transport", "transport"),
      deductions: swap(input.deductions ?? [], "medical", "medical"),
      espp: {
        ...input.espp,
        enabled: forEspp || input.espp.enabled,
        constPct: valueAt(h, "esppConst", month, input.espp.constPct),
        varPct: valueAt(h, "esppVar", month, input.espp.varPct)
      }
    };
  }
  var esppDeductionFor = (input) => (month) => calculate(inputForMonth(input, month, true)).espp.total / 12;
  function esppReport(input, today = /* @__PURE__ */ new Date()) {
    const espp = input.espp;
    const year = Number(input.ui.esppYear || today.getFullYear());
    const ledger = buildLedger({
      year,
      entries: espp.entries,
      assumptions: espp.assumptions,
      deductionFor: esppDeductionFor(input)
    });
    const payroll = payrollTax(espp.payrollTax);
    const cutoff = adjustedMonth(today, espp.changeDay, espp.monthOffset);
    const options = { assumptions: espp.assumptions, payrollTaxUsd: payroll.taxUsd };
    return {
      year,
      ledger,
      payroll,
      cutoff,
      currentMonth: monthKey(today),
      toDate: summarize(ledger, { ...options, cutoff }),
      forecast: summarize(ledger, options),
      ready: toNumber(espp.assumptions.price) > 0 && toNumber(espp.assumptions.fx) > 0
    };
  }

  // js/utils/format.js
  var whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var cents = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var formatNumber = (v) => whole.format(v);
  function createMoneyFormatter(currency) {
    const label = escapeHtml(currency);
    return (value, withCents = false) => {
      const useCents = withCents || value !== 0 && Math.abs(value) < 100;
      return `${label} ${(useCents ? cents : whole).format(value)}`;
    };
  }
  var formatPercent = (ratio) => `${(ratio * 100).toFixed(1)}%`;

  // js/data/defaults.js
  var EGYPT_BRACKETS_2026 = [
    // [rate %, from, to, excluded above]
    [0, 0, 4e4, 6e5],
    [10, 4e4, 55e3, 7e5],
    [15, 55e3, 7e4, 8e5],
    [20, 7e4, 2e5, 9e5],
    [22.5, 2e5, 4e5, 12e5],
    [25, 4e5, 12e5, ""],
    [27.5, 12e5, "", ""]
  ].map(([rate, min, max, exclusion]) => ({
    rate: String(rate),
    min: String(min),
    max: String(max),
    exclusion: String(exclusion)
  }));
  var CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR", "AED", "KWD", "QAR"];
  var DEFAULT_PROFILE = Object.freeze({
    id: "eg-2026",
    name: "Egypt 2026",
    currency: "EGP",
    tax: { exemption: "20000", brackets: EGYPT_BRACKETS_2026 },
    levies: [{ name: "Martyrs fund", rate: "0.05", base: "gross" }],
    si: {
      employeeRate: "11",
      employerRate: "18.75",
      caps: [
        { year: "2024", min: "", max: "12600" },
        { year: "2025", min: "", max: "14500" },
        { year: "2026", min: "", max: "16700" },
        { year: "2027", min: "", max: "19300" }
      ]
    },
    jobTypes: [
      { id: "ft", name: "Full-time", si: true, exemption: true, mode: "progressive", flatRate: "" },
      { id: "pt", name: "Part-time", si: true, exemption: true, mode: "progressive", flatRate: "" },
      { id: "fl", name: "Freelancer", si: false, exemption: true, mode: "progressive", flatRate: "" },
      { id: "co", name: "Consultant", si: false, exemption: false, mode: "flat", flatRate: "10" }
    ]
  });
  var DEFAULT_STATE = Object.freeze({
    amount: "",
    per: "month",
    mode: "gross",
    year: "2026",
    jobType: "ft",
    profileId: DEFAULT_PROFILE.id,
    profiles: [DEFAULT_PROFILE],
    overrides: { siBase: "", taxable: "", taxablePer: "month" },
    payPeriod: { months: "1", days: "0" },
    schedule: { weeksPerYear: "52", daysPerWeek: "5", hoursPerDay: "8", otHoursBase: "170" },
    incomes: [{ name: "Transportation", amount: "1000", per: "month", taxable: true, insurable: false }],
    overtime: [],
    cashAwards: [],
    deductions: [],
    /** ESPP: deducted after tax. `constPct` applies to basic, `varPct` to the parts ticked in `variable`. */
    espp: {
      enabled: false,
      constPct: "",
      varPct: "",
      variable: { allowances: true, overtime: true, cashAwards: true, exempt: true },
      symbol: "IBM",
      assumptions: {
        price: "",
        fx: "",
        discount: "15",
        dividend: "",
        reinvestRate: "2",
        reinvestCap: "3",
        feeIn: "6",
        taxRate: "25",
        withdrawalFee: ""
      },
      changeDay: "30",
      monthOffset: "0",
      entries: {},
      payrollTax: []
    },
    /** Dated values: { field, from: 'YYYY-MM', value }. The latest `from` on or before a month applies. */
    history: [],
    ui: {
      inTab: "pay",
      resTab: "summary",
      esppYear: "",
      histMonth: "",
      period: "month",
      theme: "",
      taxEdit: false,
      open: { overtime: false, extras: false, deductions: false, espp: false, options: false, settings: false, brackets: false, exemption: false, levies: false, si: false, jobs: false, esppTable: true, esppAssumptions: false, esppPayroll: false, esppVariable: false, histSaved: true }
    }
  });

  // js/utils/object.js
  var clone = (value) => structuredClone(value);
  function mergeShape(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over : clone(base);
    if (base && typeof base === "object") {
      const out = {};
      for (const key2 of Object.keys(base)) {
        out[key2] = over && typeof over === "object" && key2 in over ? mergeShape(base[key2], over[key2]) : clone(base[key2]);
      }
      return out;
    }
    return over === void 0 ? base : over;
  }
  var getPath = (obj, path) => path.split(".").reduce((o, k) => o == null ? o : o[k], obj);
  function setPath(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = value;
  }

  // js/state/storage.js
  var STORAGE_KEY = "salary-calc-v1";
  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  var timer;
  function saveDebounced(data, delay = 200) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
      }
    }, delay);
  }

  // js/state/migrate.js
  function upgradeV1(saved) {
    if (!saved || saved.profiles || !(saved.tax || saved.si || saved.jobTypes)) return saved;
    const { tax = {}, si = {} } = saved;
    const profile = {
      ...DEFAULT_PROFILE,
      currency: saved.currency || DEFAULT_PROFILE.currency,
      tax: { exemption: tax.exemption ?? DEFAULT_PROFILE.tax.exemption, brackets: tax.brackets ?? DEFAULT_PROFILE.tax.brackets },
      levies: tax.martyrsEnabled === false ? [] : [{ name: "Martyrs fund", rate: tax.martyrsRate ?? "0.05", base: "gross" }],
      si: { employeeRate: si.employeeRate, employerRate: si.employerRate, caps: si.caps ?? DEFAULT_PROFILE.si.caps },
      jobTypes: saved.jobTypes ?? DEFAULT_PROFILE.jobTypes
    };
    const overtime = (saved.overtime ?? []).map((o) => {
      const preset = OT_TYPES.find((t) => Number(t.mult) === Number(o.mult));
      return { type: preset ? preset.id : "custom", mult: String(o.mult ?? ""), hours: o.hours ?? "" };
    });
    return {
      ...saved,
      profiles: [profile],
      profileId: profile.id,
      overtime,
      overrides: { siBase: si.baseOverride ?? "", taxable: tax.overrideTaxable ?? "", taxablePer: tax.overridePer ?? "month" }
    };
  }
  function sanitize(state2) {
    state2.profiles = (state2.profiles.length ? state2.profiles : [DEFAULT_PROFILE]).map((p) => mergeShape(DEFAULT_PROFILE, p));
    if (!state2.profiles.some((p) => p.id === state2.profileId)) state2.profileId = state2.profiles[0].id;
    if (!isPeriod(state2.per)) state2.per = DEFAULT_STATE.per;
    if (!isPeriod(state2.overrides.taxablePer)) state2.overrides.taxablePer = "month";
    if (!isPeriod(state2.ui.period)) state2.ui.period = DEFAULT_STATE.ui.period;
    if (state2.ui.resTab === "periods") state2.ui.resTab = "tax";
    [...state2.incomes, ...state2.deductions, ...state2.cashAwards].forEach((item) => {
      if (!isItemPeriod(item.per)) item.per = "month";
    });
    sortOvertime(state2.overtime);
    return state2;
  }
  var MONTH = /^\d{4}-\d{2}$/;
  function restoreEntries(state2, saved) {
    const raw = saved?.espp?.entries;
    const entries = {};
    if (raw && typeof raw === "object") {
      for (const [month, row] of Object.entries(raw)) {
        if (MONTH.test(month) && row && typeof row === "object") entries[month] = { ...row };
      }
    }
    state2.espp.entries = entries;
    state2.history = (state2.history ?? []).filter((h) => h && typeof h === "object" && h.field);
    return state2;
  }
  function hydrate(saved) {
    const upgraded = upgradeV1(saved);
    return sanitize(restoreEntries(mergeShape(DEFAULT_STATE, upgraded), upgraded));
  }

  // js/state/store.js
  var PROFILE_PREFIX = "@";
  var listeners = /* @__PURE__ */ new Set();
  var state = hydrate(loadSaved());
  var getState = () => state;
  var activeIndex = () => Math.max(0, state.profiles.findIndex((p) => p.id === state.profileId));
  var activeProfile = () => state.profiles[activeIndex()];
  function resolve(path) {
    if (path === PROFILE_PREFIX) return `profiles.${activeIndex()}`;
    return path.startsWith(`${PROFILE_PREFIX}.`) ? `profiles.${activeIndex()}${path.slice(1)}` : path;
  }
  var get = (path) => getPath(state, resolve(path));
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function commit() {
    saveDebounced(state);
    listeners.forEach((fn) => fn(state));
  }
  function set(path, value) {
    setPath(state, resolve(path), value);
    commit();
  }
  function update(mutator) {
    mutator(state);
    commit();
  }
  function replace(next) {
    const theme = state.ui.theme;
    state = hydrate(next);
    if (!next?.ui?.theme) state.ui.theme = theme;
    commit();
  }

  // js/utils/dom.js
  var $ = (selector, root = document) => root.querySelector(selector);
  var $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1e3);
  }
  var toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // js/ui/tabs.js
  var GROUPS = [
    { nav: "[data-tabs]", key: "ui.resTab", panel: "data-panel" },
    { nav: "[data-in-tabs]", key: "ui.inTab", panel: "data-in-panel" }
  ];
  function initTabs() {
    GROUPS.forEach(({ nav, key: key2 }) => {
      $$(nav).forEach((bar) => bar.addEventListener("click", (e) => {
        const tab = e.target.closest(".tab");
        if (tab) set(key2, tab.dataset.tab);
      }));
    });
  }
  function syncTabs() {
    GROUPS.forEach(({ nav, key: key2, panel }) => {
      const active = get(key2);
      $$(`${nav} .tab`).forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === active)));
      $$(`[${panel}]`).forEach((p) => p.hidden = p.getAttribute(panel) !== active);
    });
  }

  // js/ui/form.js
  var periodOptions = (selected, periods = PERIODS) => periods.map((p) => `<option value="${p.id}"${p.id === selected ? " selected" : ""}>${p.label}</option>`).join("");
  var optionList = (items, selected) => items.map(({ value, label }) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
  var readValue = (el) => el.type === "checkbox" ? el.checked : el.value;
  function initBindings() {
    document.addEventListener("input", (e) => {
      const path = e.target.dataset.bind;
      if (path) set(path, readValue(e.target));
    });
    $$("[data-seg]").forEach((seg) => {
      seg.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-v]");
        if (btn) set(seg.dataset.seg, btn.dataset.v);
      });
    });
  }
  function syncBindings(state2) {
    $$("[data-bind]").forEach((el) => {
      const value = get(el.dataset.bind);
      if (el.type === "checkbox") el.checked = !!value;
      else if (document.activeElement !== el) el.value = value ?? "";
    });
    $$("[data-seg]").forEach((seg) => {
      const value = get(seg.dataset.seg);
      $$("button", seg).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === value)));
    });
    const solvingNet = state2.mode === "net";
    $("#amountLabel").textContent = solvingNet ? "Desired net pay" : "Gross salary";
    $("#amountHint").textContent = solvingNet ? "Target take-home; gross is solved for you." : "Basic salary before any deductions.";
  }
  function fillSelects(state2) {
    const profile = activeProfile();
    $("#perSel").innerHTML = periodOptions(state2.per);
    $("#ovPer").innerHTML = periodOptions(state2.overrides.taxablePer);
    if (!profile.jobTypes.some((j) => j.id === state2.jobType) && profile.jobTypes[0]) state2.jobType = profile.jobTypes[0].id;
    $("#jobSel").innerHTML = optionList(profile.jobTypes.map((j) => ({ value: j.id, label: j.name })), state2.jobType);
    const years = new Set(profile.si.caps.map((c) => String(c.year)).filter(Boolean));
    years.add(String(state2.year));
    $("#yearSel").innerHTML = optionList([...years].sort().map((y) => ({ value: y, label: y })), String(state2.year));
    const profiles = state2.profiles.map((p) => ({ value: p.id, label: p.name || "Untitled" }));
    $$(".profile-select").forEach((el) => el.innerHTML = optionList(profiles, state2.profileId));
  }

  // js/utils/id.js
  var newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // js/ui/advanced.js
  var openRows = /* @__PURE__ */ new Set();
  var key = (path, index) => `${path}:${index}`;
  var CHEVRON = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
  var isAdvancedOpen = (path, index) => openRows.has(key(path, index));
  function advanced(path, index, innerHtml, label = "Advanced") {
    const open = isAdvancedOpen(path, index);
    return `<div class="adv${open ? " open" : ""}">
    <div class="adv-body"${open ? "" : " inert"}>${innerHtml}</div>
    <button type="button" class="adv-toggle" data-adv="${path}" data-i="${index}" aria-expanded="${open}">${label}${CHEVRON}</button></div>`;
  }
  function handleAdvancedToggle(button) {
    const path = button.dataset.adv;
    const index = Number(button.dataset.i);
    const open = !openRows.delete(key(path, index));
    if (open) openRows.add(key(path, index));
    const wrap = button.closest(".adv");
    wrap.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    wrap.querySelector(".adv-body").toggleAttribute("inert", !open);
  }
  function shiftAdvancedAfterRemove(path, removed) {
    const prefix = `${path}:`;
    const indexes = [...openRows].filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length)));
    indexes.forEach((n) => openRows.delete(key(path, n)));
    indexes.filter((n) => n !== removed).forEach((n) => openRows.add(key(path, n > removed ? n - 1 : n)));
  }

  // js/services/http.js
  var TIMEOUT_MS = 8e3;
  async function fetchJson(url) {
    const controller = new AbortController();
    const timer2 = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      throw err.name === "AbortError" ? new Error("timed out") : err;
    } finally {
      clearTimeout(timer2);
    }
  }
  async function firstValid(sources3, read) {
    const errors = [];
    for (const source of sources3) {
      try {
        const value = Number(read(source, await fetchJson(source.url)));
        if (Number.isFinite(value) && value > 0) return { value, source: source.name };
        errors.push(`${source.name}: no value`);
      } catch (err) {
        errors.push(`${source.name}: ${err.message}`);
      }
    }
    throw new Error(errors.join("; "));
  }
  function memo(ttlMs) {
    const cache = /* @__PURE__ */ new Map();
    return async (key2, load) => {
      const hit = cache.get(key2);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      const value = await load();
      cache.set(key2, { at: Date.now(), value });
      return value;
    };
  }

  // js/services/exchangeRates.js
  var cached = memo(60 * 60 * 1e3);
  function sources(from, to, date) {
    const f = from.toLowerCase();
    const list = [{
      name: "currency-api (jsDelivr)",
      url: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date || "latest"}/v1/currencies/${f}.json`,
      read: (data) => data[f]?.[to.toLowerCase()]
    }];
    if (!date) {
      list.unshift({
        name: "open.er-api.com",
        url: `https://open.er-api.com/v6/latest/${from}`,
        read: (data) => data.result === "success" ? data.rates?.[to] : void 0
      });
    }
    return list;
  }
  async function getRate(from, to, date = "") {
    const { value, source } = await cached(`${from}>${to}@${date}`, () => firstValid(sources(from, to, date), (s, data) => s.read(data)));
    return { rate: value, source };
  }

  // js/ui/rateFetcher.js
  var RATE_DECIMALS = 4;
  var status = /* @__PURE__ */ new Map();
  var rateStatus = (index) => status.get(index) ?? "";
  function paint(index) {
    const input = $(`[data-path="cashAwards.${index}.rate"]`);
    const button = $(`[data-fetch-rate="${index}"]`);
    const state2 = rateStatus(index);
    input?.classList.toggle("rate-ok", state2 === "ok");
    input?.classList.toggle("rate-error", state2 === "error");
    if (button) {
      button.classList.toggle("loading", state2 === "loading");
      button.disabled = state2 === "loading";
    }
  }
  async function fetchRateFor(index) {
    const award = get("cashAwards")[index];
    const to = activeProfile().currency;
    if (!award || award.currency === to) return;
    status.set(index, "loading");
    paint(index);
    try {
      const { rate, source } = await getRate(award.currency, to);
      set(`cashAwards.${index}.rate`, String(Number(rate.toFixed(RATE_DECIMALS))));
      status.set(index, "ok");
      const input = $(`[data-path="cashAwards.${index}.rate"]`);
      if (input) {
        input.value = get(`cashAwards.${index}.rate`);
        input.title = `Live rate from ${source}`;
      }
    } catch (err) {
      status.set(index, "error");
      const input = $(`[data-path="cashAwards.${index}.rate"]`);
      if (input) input.title = `Could not get a live rate (${err.message}). Enter it manually.`;
    }
    paint(index);
  }
  function initRateFetcher() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-fetch-rate]");
      if (btn) fetchRateFor(Number(btn.dataset.fetchRate));
    });
    document.addEventListener("input", (e) => {
      const m = e.target.dataset.path?.match(/^cashAwards\.(\d+)\.rate$/);
      if (!m) return;
      status.delete(Number(m[1]));
      e.target.classList.remove("rate-ok", "rate-error");
    });
  }

  // js/ui/rows.js
  var removeBtn = (path, i) => `<button class="btn icon ghost danger" data-del="${path}" data-i="${i}" aria-label="Remove" title="Remove">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
  var text = (path, i, key2, value, placeholder = "", { numeric = false, disabled = false, cls = "" } = {}) => `<input type="text" class="${cls}"${numeric ? ' inputmode="decimal"' : ""}${disabled ? " disabled" : ""} data-path="${path}.${i}.${key2}"
    value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder || key2)}">`;
  var num = (path, i, key2, value, placeholder, extra = {}) => text(path, i, key2, value, placeholder, { ...extra, numeric: true });
  var check = (path, i, key2, value, label) => `<label class="check"><input type="checkbox" data-path="${path}.${i}.${key2}"${value ? " checked" : ""} aria-label="${escapeHtml(label || key2)}"> ${label}</label>`;
  var select = (path, i, key2, optionsHtml, cls = "") => `<select class="${cls}" data-path="${path}.${i}.${key2}" aria-label="${key2}">${optionsHtml}</select>`;
  var OT_OPTIONS = [...OT_TYPES.map((t) => ({ value: t.id, label: `${t.label} \xD7${t.mult}` })), { value: "custom", label: "Custom\u2026" }];
  var MODE_OPTIONS = [{ value: "progressive", label: "Brackets" }, { value: "flat", label: "Flat" }];
  var LEVY_BASES = [{ value: "gross", label: "Gross" }, { value: "taxable", label: "Taxable" }];
  var ROW_TEMPLATES = {
    incomes: (it, i) => `<div class="item income">
    ${text("incomes", i, "name", it.name, "Name")}${num("incomes", i, "amount", it.amount, "Amount")}
    ${select("incomes", i, "per", periodOptions(it.per, itemPeriods("incomes", it)))}${removeBtn("incomes", i)}
    ${advanced("incomes", i, `${check("incomes", i, "taxable", it.taxable, "Taxable")}${check("incomes", i, "insurable", it.insurable, "Counts toward SI base")}`)}</div>`,
    overtime: (it, i, ctx2) => {
      const preset = otType(it.type);
      const impact = ctx2.impacts.overtime[i];
      const net = impact && impact.annual > 0 ? `<div class="impact"><span>${ctx2.money(impact.annual / 12 * ctx2.factor)} gross</span><b>+ ${ctx2.money(impact.netAnnual / 12 * ctx2.factor)} net${ctx2.factor === 1 ? " / month" : ""}</b></div>` : "";
      return `<div class="item ot">
      ${select("overtime", i, "type", optionList(OT_OPTIONS, it.type || "custom"))}
      ${num("overtime", i, "mult", preset ? preset.mult : it.mult, "\xD7", { disabled: !!preset })}
      ${num("overtime", i, "hours", it.hours, "Hours", { cls: "hrs" })}${removeBtn("overtime", i)}${net}</div>`;
    },
    cashAwards: (it, i, ctx2) => {
      const foreign = it.currency !== ctx2.currency;
      const currencies = [.../* @__PURE__ */ new Set([...CURRENCIES, ctx2.currency, it.currency])].map((c) => ({ value: c, label: c }));
      const tone = { ok: " rate-ok", error: " rate-error" }[rateStatus(i)] ?? "";
      const rateRow = `<div class="flags"><label class="inline">1 ${escapeHtml(it.currency)} = ${num("cashAwards", i, "rate", it.rate, "rate", { cls: `xs${tone}` })} ${escapeHtml(ctx2.currency)}</label>
      <button type="button" class="btn sm ghost live" data-fetch-rate="${i}" title="Get the current rate online">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>Live rate</button></div>`;
      const impact = ctx2.impacts.cashAwards[i];
      const net = impact && impact.annual > 0 ? `<div class="impact"><span>${ctx2.money(impact.annual * ctx2.factor)} gross / yr</span><b>${ctx2.money(impact.netAnnual * ctx2.factor)} net / yr</b></div>` : "";
      return `<div class="item award">
      ${text("cashAwards", i, "name", it.name, "Name")}${num("cashAwards", i, "amount", it.amount, "Amount")}
      ${select("cashAwards", i, "currency", optionList(currencies, it.currency))}${removeBtn("cashAwards", i)}
      ${foreign ? rateRow : ""}
      ${advanced("cashAwards", i, `${select("cashAwards", i, "per", periodOptions(it.per, itemPeriods("cashAwards", it)), "xs-select")}${check("cashAwards", i, "taxable", it.taxable, "Taxable")}`)}
      ${net}</div>`;
    },
    deductions: (it, i) => `<div class="item income">
    ${text("deductions", i, "name", it.name, "Name")}${num("deductions", i, "amount", it.amount, "Amount")}
    ${select("deductions", i, "per", periodOptions(it.per, itemPeriods("deductions", it)))}${removeBtn("deductions", i)}
    ${advanced("deductions", i, check("deductions", i, "pretax", it.pretax, "Before tax (reduces taxable income)"))}</div>`,
    "espp.payrollTax": (e, i) => {
      const p = "espp.payrollTax";
      return `<tr><td><input type="date" data-path="${p}.${i}.date" value="${escapeHtml(e.date)}" aria-label="Payroll date"></td>
      <td>${num(p, i, "gains", e.gains, "gains")}</td><td>${num(p, i, "tax", e.tax, "tax")}</td>
      <td>${num(p, i, "rate", e.rate, "rate")}</td><td>${removeBtn(p, i)}</td></tr>`;
    },
    "@.tax.brackets": (b, i) => {
      const p = "@.tax.brackets";
      return `<tr><td>${num(p, i, "rate", b.rate, "%")}</td><td>${num(p, i, "min", b.min, "0")}</td>
      <td>${num(p, i, "max", b.max, "\u221E")}</td><td>${num(p, i, "exclusion", b.exclusion, "none")}</td><td>${removeBtn(p, i)}</td></tr>`;
    },
    "@.levies": (l, i) => {
      const p = "@.levies";
      return `<tr><td>${text(p, i, "name", l.name, "Name")}</td><td>${num(p, i, "rate", l.rate, "%")}</td>
      <td>${select(p, i, "base", optionList(LEVY_BASES, l.base))}</td><td>${removeBtn(p, i)}</td></tr>`;
    },
    "@.si.caps": (c, i) => {
      const p = "@.si.caps";
      return `<tr><td>${num(p, i, "year", c.year, "Year")}</td><td>${num(p, i, "min", c.min, "none")}</td>
      <td>${num(p, i, "max", c.max, "none")}</td><td>${removeBtn(p, i)}</td></tr>`;
    },
    "@.jobTypes": (j, i) => {
      const p = "@.jobTypes";
      return `<tr><td>${text(p, i, "name", j.name, "Name")}</td><td>${check(p, i, "si", j.si, "")}</td>
      <td>${check(p, i, "exemption", j.exemption, "")}</td><td>${select(p, i, "mode", optionList(MODE_OPTIONS, j.mode))}</td>
      <td>${num(p, i, "flatRate", j.flatRate, "%")}</td><td>${removeBtn(p, i)}</td></tr>`;
    }
  };

  // js/ui/lists.js
  var RESET_PATHS = { brackets: ["@.tax.brackets", "tax.brackets"], caps: ["@.si.caps", "si.caps"], jobTypes: ["@.jobTypes", "jobTypes"] };
  var AFFECTS_SELECTS = ["@.jobTypes", "@.si.caps"];
  var IMPACT_LISTS = ["overtime", "cashAwards"];
  var ctx = { currency: "", money: String, factor: 1, impacts: { overtime: [], cashAwards: [] } };
  function setListContext(next) {
    ctx = next;
    IMPACT_LISTS.forEach(renderList);
  }
  function renderList(path) {
    const host = $(`[data-list="${path}"]`);
    if (!host || host.contains(document.activeElement)) return;
    const items = get(path);
    if (items.length) host.innerHTML = items.map((item, i) => ROW_TEMPLATES[path](item, i, ctx)).join("");
    else if (host.tagName === "TBODY") host.innerHTML = '<tr><td colspan="6" class="hint">No rows</td></tr>';
    else host.innerHTML = host.hasAttribute("data-quiet") ? "" : '<div class="empty">Nothing added yet</div>';
    host.hidden = !items.length && host.hasAttribute("data-quiet");
    updateCounts();
  }
  function updateCounts() {
    $$("[data-count]").forEach((badge) => {
      const total = badge.dataset.count.split(",").reduce((n, path) => n + get(path).length, 0);
      badge.textContent = total ? String(total) : "";
    });
  }
  var renderAllLists = () => Object.keys(ROW_TEMPLATES).forEach(renderList);
  function renderPresets() {
    $$("[data-presets]").forEach((host) => {
      const kind = host.dataset.presets;
      host.innerHTML = PRESETS[kind].map((p, i) => `<button class="chip" data-preset="${kind}" data-i="${i}">+ ${escapeHtml(p.name)}</button>`).join("");
    });
  }
  function focusFirstEmpty(path) {
    const inputs = $$(`[data-list="${path}"] input[type="text"]:not([disabled])`);
    (inputs.reverse().find((el) => !el.value) ?? inputs[0])?.focus();
  }
  function refresh(path) {
    const host = $(`[data-list="${path}"]`);
    if (host?.contains(document.activeElement)) document.activeElement.blur();
    renderList(path);
    if (AFFECTS_SELECTS.includes(path)) fillSelects(getState());
  }
  function newRow(path) {
    if (path === "overtime") {
      const type = nextOvertimeType(get("overtime"));
      return type ? { type: type.id, mult: type.mult, hours: "" } : { type: "custom", mult: "1.5", hours: "" };
    }
    if (path === "cashAwards") return { ...clone(BLANK_ROWS.cashAwards), currency: activeProfile().currency === "USD" ? "EGP" : "USD" };
    const row = clone(BLANK_ROWS[path]);
    if (path === "@.jobTypes") row.id = newId("j");
    return row;
  }
  var ACTIONS = {
    add(path) {
      update(() => {
        get(path).push(newRow(path));
        if (path === "overtime") sortOvertime(get(path));
      });
      refresh(path);
      focusFirstEmpty(path);
    },
    del(path, index) {
      if (path === "@.jobTypes" && get(path).length <= 1) return toast("Keep at least one job type");
      update(() => get(path).splice(index, 1));
      shiftAdvancedAfterRemove(path, index);
      refresh(path);
    },
    preset(kind, index) {
      update(() => get(kind).push(clone(PRESETS[kind][index])));
      refresh(kind);
      focusFirstEmpty(kind);
    },
    reset(key2) {
      const [path, profileKey] = RESET_PATHS[key2];
      const source = profileKey.split(".").reduce((o, k) => o[k], DEFAULT_PROFILE);
      set(path, clone(source));
      refresh(path);
      toast("Restored Egypt defaults");
    }
  };
  function onOvertimeTypeChange(index, type) {
    update(() => {
      const list = get("overtime");
      const item = list[index];
      if (type !== "custom") item.mult = "";
      sortOvertime(list);
    });
    refresh("overtime");
    if (type === "custom") {
      const row = get("overtime").findIndex((o) => o.type === "custom" && !o.mult);
      $(`[data-path="overtime.${row >= 0 ? row : 0}.mult"]`)?.focus();
    }
  }
  function initLists() {
    renderPresets();
    renderAllLists();
    document.addEventListener("input", (e) => {
      const path = e.target.dataset.path;
      if (path && e.target.tagName !== "SELECT") set(path, e.target.type === "checkbox" ? e.target.checked : e.target.value);
    });
    document.addEventListener("change", (e) => {
      const path = e.target.dataset.path ?? "";
      if (path && e.target.tagName === "SELECT") set(path, e.target.value);
      const ot = path.match(/^overtime\.(\d+)\.(type|mult)$/);
      if (ot) {
        if (ot[2] === "type") return onOvertimeTypeChange(Number(ot[1]), e.target.value);
        update(() => sortOvertime(get("overtime")));
        return refresh("overtime");
      }
      if (/^cashAwards\.\d+\.currency$/.test(path)) return refresh("cashAwards");
      if (AFFECTS_SELECTS.some((src) => path.startsWith(`${src}.`))) fillSelects(getState());
    });
    document.addEventListener("focusout", (e) => {
      const host = e.target.closest?.("[data-list]");
      if (host && IMPACT_LISTS.includes(host.dataset.list)) setTimeout(() => renderList(host.dataset.list));
    });
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.adv) return handleAdvancedToggle(btn);
      const { add, del, preset, reset, i } = btn.dataset;
      if (add) ACTIONS.add(add);
      else if (del) ACTIONS.del(del, Number(i));
      else if (preset) ACTIONS.preset(preset, Number(i));
      else if (reset) ACTIONS.reset(reset);
    });
  }

  // js/ui/collapsibles.js
  function initCollapsibles() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("summary [data-stop]")) e.stopPropagation();
    }, true);
    document.addEventListener("toggle", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLDetailsElement) || !el.dataset.open) return;
      const path = `ui.open.${el.dataset.open}`;
      if (get(path) !== el.open) set(path, el.open);
    }, true);
  }
  function syncCollapsibles(state2) {
    $$("details[data-open]").forEach((el) => {
      const open = !!state2.ui.open[el.dataset.open];
      if (el.open !== open) el.open = open;
    });
  }

  // js/ui/profiles.js
  var ACTIONS2 = {
    edit() {
      set("ui.taxEdit", !getState().ui.taxEdit);
    },
    new() {
      const source = activeProfile();
      const profile = { ...clone(source), id: newId("p"), name: `${source.name} copy` };
      update((s) => {
        s.profiles.push(profile);
        s.profileId = profile.id;
        s.ui.taxEdit = true;
      });
      $('#profileEditor input[data-bind="@.name"]')?.select();
      toast("Profile created \u2014 rename and edit it");
    },
    delete() {
      const { profiles } = getState();
      if (profiles.length <= 1) return;
      const profile = activeProfile();
      if (!confirm(`Delete the "${profile.name}" tax profile?`)) return;
      update((s) => {
        s.profiles = s.profiles.filter((p) => p.id !== profile.id);
        s.profileId = s.profiles[0].id;
      });
      toast("Profile deleted");
    }
  };
  var CUSTOM = "__custom";
  var normalizeCode = (value) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  function renderCurrency(profile, forceCustom = false) {
    const select3 = $("#currencySel");
    const input = $("#currencyCustom");
    const custom = forceCustom || !CURRENCIES.includes(profile.currency);
    select3.innerHTML = optionList(
      [...CURRENCIES.map((c) => ({ value: c, label: c })), { value: CUSTOM, label: "Custom\u2026" }],
      custom ? CUSTOM : profile.currency
    );
    input.hidden = !custom;
    if (custom && document.activeElement !== input) input.value = CURRENCIES.includes(profile.currency) ? "" : profile.currency;
  }
  function initCurrency(onProfileChanged) {
    $("#currencySel").addEventListener("change", (e) => {
      if (e.target.value === CUSTOM) {
        $("#currencyCustom").hidden = false;
        $("#currencyCustom").value = "";
        $("#currencyCustom").focus();
        return;
      }
      set("@.currency", e.target.value);
      onProfileChanged();
    });
    $("#currencyCustom").addEventListener("input", (e) => {
      const code = normalizeCode(e.target.value);
      if (code) set("@.currency", code);
    });
    $("#currencyCustom").addEventListener("change", (e) => {
      e.target.value = normalizeCode(e.target.value);
      onProfileChanged();
    });
  }
  function initProfiles(onProfileChanged) {
    initCurrency(onProfileChanged);
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-profile]");
      if (!btn) return;
      ACTIONS2[btn.dataset.profile]();
      onProfileChanged();
    });
    document.addEventListener("change", (e) => {
      if (e.target.matches("[data-profile-select]")) {
        set("profileId", e.target.value);
        onProfileChanged();
      } else if (e.target.matches('[data-bind="@.name"]')) {
        onProfileChanged();
      }
    });
  }
  function syncProfiles(state2) {
    const editing = !!state2.ui.taxEdit;
    $("#profileEditor").hidden = !editing;
    const edit = $("#editProfileBtn");
    edit.textContent = editing ? "Done" : "Edit";
    edit.classList.toggle("primary", editing);
    $("#deleteProfileBtn").hidden = state2.profiles.length <= 1;
    const issues = validateBrackets(activeProfile().tax.brackets);
    $("#bracketWarn").innerHTML = issues.length ? `<div class="callout warn" style="margin-top:8px">${issues.map(escapeHtml).join("<br>")}</div>` : "";
    $$("[data-profile-select]").forEach((el) => {
      if (el.value !== state2.profileId) el.value = state2.profileId;
    });
    const editingCode = document.activeElement?.id === "currencyCustom";
    if (document.activeElement?.id !== "currencySel") renderCurrency(activeProfile(), editingCode);
  }

  // js/ui/results/shared.js
  var COLORS = {
    net: "var(--c-net)",
    tax: "var(--c-tax)",
    si: "var(--c-si)",
    employer: "var(--c-emp)",
    other: "var(--c-other)"
  };
  var line = (label, value, cls = "", color = "") => `<div class="line ${cls}"><span class="k">${color ? `<i class="sw" style="background:${color}"></i>` : ""}${label}</span><span class="v">${value}</span></div>`;
  var negative = (value) => `<span class="neg">\u2212 ${value}</span>`;
  var positive = (value) => `<span class="pos">${value}</span>`;
  var stat = (label, value, tone = "") => `<div class="stat"><div class="k">${label}</div><div class="v ${tone}">${value}</div></div>`;
  function legend(segments) {
    const total = segments.reduce((a, s) => a + s.value, 0) || 1;
    return `<div class="legend">${segments.filter((s) => s.value > 0).map((s) => `<span><i class="sw" style="background:${s.color}"></i>${s.label} ${formatPercent(s.value / total)}</span>`).join("")}</div>`;
  }
  function donut(segments, centerValue, centerLabel) {
    const total = segments.reduce((a, s) => a + s.value, 0) || 1;
    let angle = 0;
    const stops = segments.map((s) => {
      const start = angle;
      angle += s.value / total * 360;
      return `${s.color} ${start}deg ${angle}deg`;
    });
    return `<div class="donut-box">
    <div class="donut" style="background:conic-gradient(${stops.join(",")})"><div class="c"><b>${centerValue}</b><span>${centerLabel}</span></div></div>
    ${legend(segments)}</div>`;
  }
  function stackedBar(segments) {
    const total = segments.reduce((a, s) => a + s.value, 0) || 1;
    return `<div class="flow">${segments.filter((s) => s.value > 0).map((s) => `<div style="flex:${s.value / total};background:${s.color}" title="${s.label}"></div>`).join("")}</div>${legend(segments)}`;
  }

  // js/ui/results/summary.js
  var isSmallUnit = (id) => id === "hour" || id === "day";
  function periodSwitcher(active) {
    return `<div class="results-head"><div class="seg" data-period>${PERIODS.map((p) => `<button data-v="${p.id}" aria-pressed="${p.id === active}">${p.label}</button>`).join("")}</div></div>`;
  }
  function notices(r, at, period, money) {
    let html = "";
    if (r.solved) {
      html += `<div class="callout">To take home <b>${at(r.targetNet)}</b> per ${period.unit}, the basic gross salary must be
      <b>${at(r.baseAnnual)}</b> (${money(r.baseAnnual / 12)} / month).</div>`;
    }
    if (r.overridden) {
      html += `<div class="callout warn">Using a <b>manual taxable amount</b> of ${money(r.taxableAnnual / 12)} / month
      (auto would be ${money(r.autoTaxable / 12)}).</div>`;
    }
    if (r.cashAwards.some((a) => a.missingRate)) {
      html += '<div class="callout warn">A cash award in another currency has no <b>exchange rate</b>, so it counts as 0.</div>';
    }
    return html;
  }
  function breakdownLines(r, state2, at) {
    const sub = (label, annual, netAnnual) => line(`${label}${netAnnual !== void 0 ? ` <span class="hint">net ${at(netAnnual)}</span>` : ""}`, positive(at(annual)), "sub");
    const earnings = [
      line("Basic salary", positive(at(r.baseAnnual))),
      ...r.incomes.map((it) => sub(escapeHtml(it.name) + (it.taxable ? "" : ' <span class="hint">(exempt)</span>'), it.annual)),
      ...r.overtime.filter((o) => o.annual).map((o) => sub(escapeHtml(o.label), o.annual, o.netAnnual)),
      ...r.cashAwards.filter((a) => a.annual).map((a) => sub(escapeHtml(a.name), a.annual, a.netAnnual)),
      line("Gross pay", positive(at(r.grossAnnual)), "strong")
    ];
    const siNote = r.si.enabled ? `${escapeHtml(state2.profile.si.employeeRate)}%` : "n/a";
    const taxNote = r.flat ? ` <span class="hint">flat ${r.marginalRate}%</span>` : "";
    const deductions = [
      line(`Social insurance <span class="hint">${siNote}</span>`, negative(at(r.si.employee)), "sep", COLORS.si),
      line(`Income tax${taxNote}`, negative(at(r.incomeTax)), "", COLORS.tax),
      ...r.levies.filter((l) => l.annual).map((l) => line(escapeHtml(l.name), negative(at(l.annual)), "", COLORS.tax)),
      ...r.deductions.map((d) => line(escapeHtml(d.name), negative(at(d.annual)), "", COLORS.other)),
      r.espp.total ? line("ESPP", negative(at(r.espp.total)), "", COLORS.other) : "",
      line("Total deductions", negative(at(r.totalDeductions)), "strong sep"),
      line("Net pay", at(r.net), "strong net-line")
    ];
    return [...earnings, ...deductions].join("");
  }
  function renderSummary(full, state2, money, pay) {
    const base = findPeriod(state2.ui.period);
    const isMonth = base.id === "month";
    const period = isMonth ? { ...base, label: pay.label, unit: pay.unit } : base;
    const r = isMonth ? pay.result : full;
    const at = (annual) => money(fromAnnual(annual, period.id, state2.schedule, pay.factor), isSmallUnit(period.id));
    const segments = [
      { color: COLORS.net, value: Math.max(r.net, 0), label: "Net pay" },
      { color: COLORS.tax, value: r.incomeTax + r.leviesTotal, label: "Taxes" },
      { color: COLORS.si, value: r.si.employee, label: "Social insurance" },
      { color: COLORS.other, value: r.preTax + r.postTax + r.espp.total, label: "Other deductions" }
    ];
    const takeHome = r.grossAnnual ? r.net / r.grossAnnual : 0;
    const taxTile = `<div class="stat"><div class="k">Avg. income tax</div>
    <div class="v">${formatPercent(r.avgTaxRate)} <small>max bracket ${r.marginalRate}%</small></div></div>`;
    return `${periodSwitcher(period.id)}${notices(r, at, period, money)}
    <div class="hero">
      <div class="k">Net pay \xB7 ${period.label}</div>
      <div class="v">${at(r.net)}</div>
      <div class="s">${money(full.net)} per year \xB7 ${money(full.net / 12)} per full month</div>
    </div>
    <div class="stats three">
      ${stat("Gross", at(r.grossAnnual), "pos")}
      ${stat("Deductions", at(r.totalDeductions), "neg")}
      ${taxTile}
    </div>
    <div class="split">
      <div class="lines">${breakdownLines(r, state2, at)}</div>
      ${donut(segments, formatPercent(takeHome), "take-home")}
    </div>`;
  }

  // js/ui/results/periods.js
  function renderPeriods(full, state2, money, pay) {
    const columnsOf = (r) => [
      ["Gross", r.grossAnnual],
      ["Social ins.", r.si.employee],
      ["Taxes", r.incomeTax + r.leviesTotal],
      ["Other", r.preTax + r.postTax + r.espp.total],
      ["Net", r.net]
    ];
    const rows = PERIODS.map((p) => {
      const cents2 = p.id === "hour" || p.id === "day";
      const cells = columnsOf(p.id === "month" ? pay.result : full).map(([name, annual]) => {
        const v = money(fromAnnual(annual, p.id, state2.schedule, pay.factor), cents2);
        return `<td class="r">${name === "Net" ? `<b>${v}</b>` : v}</td>`;
      }).join("");
      const label = p.id === "month" && !pay.standard ? `${p.label} <span class="hint">(${pay.label})</span>` : p.label;
      return `<tr class="${p.id === state2.ui.period ? "active" : ""}"><td><b>${label}</b></td>${cells}</tr>`;
    }).join("");
    const s = state2.schedule;
    return `<div class="table-wrap"><table>
      <thead><tr><th>Period</th>${columnsOf(full).map(([n]) => `<th class="r">${n}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="hint">Based on ${escapeHtml(s.weeksPerYear)} weeks/year, ${escapeHtml(s.daysPerWeek)} days/week,
      ${escapeHtml(s.hoursPerDay)} hours/day \u2014 change under More options \u2192 Settings.</p>`;
  }

  // js/ui/results/taxDetail.js
  function taxableTable(r, money) {
    const row = (label, annual, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="r">${money(annual / 12)}</td><td class="r">${money(annual)}</td></tr>`;
    const siNote = `<span class="hint">base ${money(r.si.base)}${r.si.capped ? " (capped)" : ""}</span>`;
    return `<div class="section-title">Taxable income</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Step</th><th class="r">Monthly</th><th class="r">Annual</th></tr></thead>
      <tbody>
        ${row("Taxable gross (basic + taxable extras + overtime)", r.grossTaxable)}
        ${row(`\u2212 Employee social insurance ${siNote}`, r.si.employee)}
        ${row("\u2212 Personal exemption", r.exemption)}
        ${r.preTax ? row("\u2212 Pre-tax deductions", r.preTax) : ""}
        ${r.exemptAllowances ? row("Exempt extras (not taxed)", r.exemptAllowances, "muted") : ""}
        ${row(`Taxable income${r.overridden ? " (manual)" : ""}`, r.taxableAnnual, "total")}
      </tbody></table></div>`;
  }
  function bracketTable(r, money) {
    const statusOf = (b) => b.excluded ? "Excluded" : b.portion > 0 ? "Applied" : "\u2014";
    const classOf = (b) => b.excluded ? "excluded" : b.portion > 0 ? "active" : "muted";
    const rows = r.bracketRows.map((b) => `<tr class="${classOf(b)}">
      <td>${b.rate}%</td>
      <td>${formatNumber(b.from)} \u2013 ${b.max === Infinity ? "\u221E" : formatNumber(b.max)}</td>
      <td>${statusOf(b)}</td>
      <td class="r">${money(b.portion / 12)}</td><td class="r">${money(b.tax / 12)}</td>
    </tr>`).join("");
    const excluded = r.bracketRows.filter((b) => b.excluded);
    const note = excluded.length ? `<p class="hint">Taxable income exceeds ${money(excluded.at(-1).exclusion)}, so the
        ${excluded.map((b) => `${b.rate}%`).join(", ")} bracket${excluded.length > 1 ? "s are" : " is"} excluded.</p>` : "";
    return `<div class="section-title">Brackets</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Rate</th><th>Range (annual)</th><th>Status</th><th class="r">Taxed amount / month</th><th class="r">Tax / month</th></tr></thead>
      <tbody>${rows}<tr class="total"><td colspan="4">Income tax</td><td class="r">${money(r.incomeTax / 12)}</td></tr></tbody>
    </table></div>${note}`;
  }
  function leviesNote(r, money) {
    return r.levies.filter((l) => l.annual).map((l) => `<p class="hint">${escapeHtml(l.name)}: ${l.rate}% of ${l.base === "taxable" ? "taxable income" : "gross"} = ${money(l.annual / 12)} / month.</p>`).join("");
  }
  function renderTaxDetail(r, state2, money) {
    const body = r.flat ? `<div class="callout">This job type uses a <b>flat ${r.marginalRate}%</b> rate:
        ${money(r.taxableAnnual)} \xD7 ${r.marginalRate}% = <b>${money(r.incomeTax)}</b> / year.</div>` : bracketTable(r, money);
    return `<div class="spacer"></div>${taxableTable(r, money)}<div class="spacer"></div>${body}${leviesNote(r, money)}`;
  }

  // js/ui/results/employer.js
  function renderEmployer(r, state2, money) {
    const monthly = (annual) => money(annual / 12);
    const toGovernment = r.employeeGovTake + r.si.employer;
    const visibleRate = r.grossAnnual ? r.employeeGovTake / r.grossAnnual : 0;
    const netShare = r.employerCost ? r.net / r.employerCost * 100 : 0;
    const segments = [
      { color: COLORS.net, value: Math.max(r.net, 0), label: "Your net pay" },
      { color: COLORS.tax, value: r.incomeTax + r.leviesTotal, label: "Taxes" },
      { color: COLORS.si, value: r.si.employee, label: "Your SI" },
      { color: COLORS.employer, value: r.si.employer, label: "Employer SI" },
      { color: COLORS.other, value: r.preTax + r.postTax + r.espp.total, label: "Other deductions" }
    ];
    return `<div class="stats">
      ${stat("Employer cost / month", monthly(r.employerCost))}
      ${stat("To government / month", monthly(toGovernment))}
      ${stat("Real tax rate", formatPercent(r.realTaxRate))}
      ${stat("Visible rate", formatPercent(visibleRate))}
    </div>
    <div class="section-title">Where the employer's money goes</div>
    ${stackedBar(segments)}
    <div class="spacer"></div>
    <div class="lines">
      ${line("Gross salary", monthly(r.grossAnnual))}
      ${line(`Employer social insurance <span class="hint">${escapeHtml(state2.profile.si.employerRate)}% of ${money(r.si.base)}</span>`, monthly(r.si.employer), "", COLORS.employer)}
      ${line("Total employer cost", monthly(r.employerCost), "strong sep")}
      ${line("Paid by you (tax + SI)", monthly(r.employeeGovTake), "sep")}
      ${line("Paid by employer (SI)", monthly(r.si.employer))}
      ${line("Total to government", monthly(toGovernment), "strong")}
    </div>
    <div class="callout" style="margin-top:14px">For every <b>100</b> your employer spends on you,
      <b>${netShare.toFixed(1)}</b> reaches you as net pay and <b>${(r.realTaxRate * 100).toFixed(1)}</b> goes to the government.</div>`;
  }

  // js/ui/results/index.js
  var renderTax = (...args) => `${renderTaxDetail(...args)}<div class="section-title" style="margin-top:18px">By period</div>${renderPeriods(...args)}`;
  var VIEWS = {
    summary: renderSummary,
    tax: renderTax,
    employer: renderEmployer
  };
  var EMPTY = '<div class="empty" style="padding:40px 16px">Enter a salary to see the breakdown.</div>';
  function initResults() {
    $('[data-view="summary"]').addEventListener("click", (e) => {
      const btn = e.target.closest("[data-period] button");
      if (btn) set("ui.period", btn.dataset.v);
    });
  }
  function otRateLine(result, money) {
    if (!result?.hourlyRate) return "";
    const ratio = result.overtimeAnnual > 0 ? result.overtimeNet / result.overtimeAnnual : result.grossAnnual > 0 ? result.net / result.grossAnnual : 0;
    return `OT base hourly rate: <b>${money(result.hourlyRate, true)}</b> \xB7 net <b class="pos">${money(result.hourlyRate * ratio, true)}</b>`;
  }
  function renderResults(result, state2, money, pay) {
    $("#otRate").innerHTML = otRateLine(pay.result, money);
    const active = state2.ui.resTab;
    $$("[data-view]").forEach((host) => {
      if (host.dataset.view !== active || !VIEWS[active]) return;
      host.innerHTML = result ? VIEWS[active](result, state2, money, pay) : EMPTY;
    });
  }

  // js/ui/settings.js
  function applyTheme(theme) {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }
  function initSettings(onReplaced) {
    $("#themeBtn").addEventListener("click", () => {
      const { theme } = getState().ui;
      const isDark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      set("ui.theme", isDark ? "light" : "dark");
    });
    $("#exportBtn").addEventListener("click", () => downloadJson("salary-settings.json", getState()));
    $("#importFile").addEventListener("change", async (e) => {
      const [file] = e.target.files;
      e.target.value = "";
      if (!file) return;
      try {
        replace(JSON.parse(await file.text()));
        onReplaced();
        toast("Settings imported");
      } catch {
        toast("Invalid settings file");
      }
    });
    $("#resetAll").addEventListener("click", () => {
      if (!confirm("Reset all values, extras and tax profiles to defaults?")) return;
      replace(structuredClone(DEFAULT_STATE));
      onReplaced();
      toast("Everything reset");
    });
  }
  function syncSettings(state2) {
    applyTheme(state2.ui.theme);
  }

  // js/ui/stepper.js
  var DRAG_THRESHOLD_PX = 6;
  var PX_PER_STEP = 24;
  var limitOf = (input, key2, fallback) => input.dataset[key2] === void 0 ? fallback : Number(input.dataset[key2]);
  function applyStep(input, direction, multiplier = 1) {
    const step = Number(input.dataset.step) || 1;
    const delta = direction * step * multiplier;
    input.value = String(stepValue(input.value, delta, limitOf(input, "min", 0), limitOf(input, "max", Infinity)));
    set(input.dataset.bind, input.value);
  }
  function enableDrag(input) {
    let startY = 0;
    let stepsApplied = 0;
    let dragging = false;
    input.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      startY = e.clientY;
      stepsApplied = 0;
      dragging = false;
    });
    input.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || !e.buttons) return;
      const delta = startY - e.clientY;
      if (!dragging && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      if (!dragging) {
        dragging = true;
        input.setPointerCapture(e.pointerId);
        input.blur();
      }
      const target = Math.trunc(delta / PX_PER_STEP);
      if (target !== stepsApplied) {
        applyStep(input, target - stepsApplied);
        stepsApplied = target;
      }
    });
    const stop = () => {
      dragging = false;
    };
    input.addEventListener("pointerup", stop);
    input.addEventListener("pointercancel", stop);
  }
  function enableWheelAndKeys(input) {
    input.addEventListener("wheel", (e) => {
      if (document.activeElement !== input) return;
      e.preventDefault();
      applyStep(input, e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      applyStep(input, e.key === "ArrowUp" ? 1 : -1, e.shiftKey ? 10 : 1);
    });
  }
  function initSteppers() {
    $$("input[data-step]").forEach((input) => {
      if (input.hasAttribute("data-swipe")) enableDrag(input);
      enableWheelAndKeys(input);
    });
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-step-btn]");
      const input = btn && $(`input[data-bind="${btn.dataset.target}"]`);
      if (input) applyStep(input, Number(btn.dataset.stepBtn));
    });
  }

  // js/services/stockPrice.js
  var cached2 = memo(15 * 60 * 1e3);
  var sources2 = (symbol) => [{
    name: "Alpha Vantage (demo)",
    url: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=demo`
  }];
  async function getStockPrice(symbol) {
    const clean = String(symbol || "").trim().toUpperCase();
    if (!clean) throw new Error("No symbol set");
    const { value, source } = await cached2(clean, () => firstValid(sources2(clean), (_, data) => {
      if (data.Information || data.Note) throw new Error("demo key only covers a few symbols, such as IBM");
      return data["Global Quote"]?.["05. price"];
    }));
    return { price: value, source };
  }

  // js/ui/espp.js
  var LOCKABLE = [
    { key: "deducted", label: "Deducted", decimals: 2 },
    { key: "deductedUsd", label: "Deducted USD", decimals: 2 },
    { key: "dividend", label: "Dividend", decimals: 2 },
    { key: "shares", label: "ACC. Shares", decimals: 5 }
  ];
  var fixed = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : "";
  var usd = (v, d = 2) => `$${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  function renderEsppInputs(result, money) {
    const tile2 = $("#esppTile");
    if (!tile2) return;
    const e = result?.espp;
    const on = getState().espp.enabled;
    tile2.innerHTML = on && e ? `<div><span>Constant</span><b>${money(e.constant / 12)}</b></div>
       <div><span>Variable</span><b>${money(e.variable / 12)}</b></div>
       <div class="tot"><span>Total / month</span><b>${money(e.total / 12)}</b></div>` : '<div class="hint">Turn ESPP on to deduct a % of pay into shares.</div>';
    $("#esppFields").hidden = !on;
  }
  function tile(label, a, b, tone = "") {
    return `<div class="etile ${tone}"><div class="k">${label}</div>
    <div class="pair"><div><b>${a.v}</b><small>${a.k}</small></div><div><b>${b.v}</b><small>${b.k}</small></div></div></div>`;
  }
  function topTiles(rep, money) {
    const label = monthLabel(rep.cutoff);
    return `<div class="etiles">
    ${tile("Withdrawal", { v: money(rep.toDate.withdrawal), k: `to ${label}` }, { v: money(rep.forecast.withdrawal), k: `${rep.year} forecast` }, "w")}
    ${tile("Profit", { v: money(rep.toDate.profit), k: `to ${label}` }, { v: money(rep.forecast.profit), k: `${rep.year} forecast` }, "p")}
    ${tile("Shares", { v: formatNumber2(rep.toDate.shares), k: `to ${label}` }, { v: formatNumber2(rep.forecast.shares), k: `${rep.year} forecast` }, "s")}
  </div>`;
  }
  var formatNumber2 = (v) => (Number(v) || 0).toFixed(2);
  function cell(row, col) {
    const field = row[col.key];
    const shown = fixed(field.value, col.decimals);
    return `<td class="lock${field.locked ? " on" : ""}">
    <input type="text" inputmode="decimal" data-espp-entry="${row.month}" data-key="${col.key}"
      value="${field.locked ? escapeHtml(shown) : ""}" placeholder="${shown}" aria-label="${col.label} ${row.month}"
      title="${field.locked ? "Locked actual \u2014 clear to forecast" : "Forecast \u2014 type the actual to lock it"}"></td>`;
  }
  function ledgerTable(rep) {
    const rows = rep.ledger.rows.map((r) => {
      const cls = [r.month > rep.cutoff ? "future" : "", r.month === rep.cutoff ? "active" : ""].join(" ");
      return `<tr class="${cls}"><td><b>${monthLabel(r.month).replace(" " + rep.year, "")}</b></td>
      ${cell(r, LOCKABLE[0])}${cell(r, LOCKABLE[1])}${cell(r, LOCKABLE[2])}
      <td class="r muted-cell">${fixed(r.reinvestFee, 3)}</td><td class="r muted-cell">${fixed(r.feesIn)}</td>
      <td class="r">${fixed(r.accredited)}</td>${cell(r, LOCKABLE[3])}
      <td class="r">${fixed(r.untaxed)}</td><td class="r">${fixed(r.actualShare)}</td></tr>`;
    }).join("");
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
      ${r("Deducted from pay", money(d.deducted), money(f.deducted))}
      ${r("Shares held", fixed(d.shares, 5), fixed(f.shares, 5))}
      ${r("Market value", usd(d.marketValueUsd), usd(f.marketValueUsd))}
      ${r("Un-taxed gains", usd(d.untaxed), usd(f.untaxed))}
      ${r("Tax still due", usd(d.taxDueUsd), usd(f.taxDueUsd))}
      ${r("Dividends", usd(d.dividends), usd(f.dividends))}
      ${r("Fees", usd(d.fees), usd(f.fees))}
      <tr class="total"><td>Withdrawal</td><td class="r">${money(d.withdrawal)}</td><td class="r">${money(f.withdrawal)}</td></tr>
      ${r("Profit vs. deducted", money(d.profit), money(f.profit))}
    </tbody></table></div>`;
  }
  function renderEsppTab(rep, money) {
    const host = $('[data-view="espp"]');
    if (!host || host.contains(document.activeElement)) return;
    const a = getState().espp.assumptions;
    const warn = rep.ready ? "" : `<div class="callout warn">Set the <b>share price</b> and <b>USD rate</b> under Assumptions (or press the live buttons) to value the shares.</div>`;
    host.innerHTML = `${warn}${topTiles(rep, money)}
    <div class="row between" style="margin:4px 0 10px">
      <div class="seg" data-espp-year>${[rep.year - 1, rep.year, rep.year + 1].map((y) => `<button data-v="${y}" aria-pressed="${y === rep.year}">${y}</button>`).join("")}</div>
      <span class="hint">Price ${a.price ? usd(a.price) : "\u2014"} \xB7 1 USD = ${a.fx || "\u2014"}</span>
    </div>
    ${breakdown(rep, money)}
    <div class="spacer"></div>
    ${ledgerTable(rep)}`;
  }
  async function fetchLive(kind, button) {
    const input = $(`[data-bind="espp.assumptions.${kind}"]`);
    button.classList.add("loading");
    button.disabled = true;
    try {
      const value = kind === "price" ? (await getStockPrice(getState().espp.symbol)).price : (await getRate("USD", activeProfile().currency)).rate;
      set(`espp.assumptions.${kind}`, String(Number(value.toFixed(4))));
      input.classList.add("rate-ok");
      input.classList.remove("rate-error");
      input.title = "Live value";
    } catch (err) {
      input.classList.add("rate-error");
      input.classList.remove("rate-ok");
      input.title = `Could not fetch (${err.message}). Enter it manually.`;
      toast("Live value unavailable \u2014 enter it manually");
    } finally {
      button.classList.remove("loading");
      button.disabled = false;
    }
  }
  function initEspp(onChanged) {
    document.addEventListener("click", (e) => {
      const live = e.target.closest("[data-espp-live]");
      if (live) return fetchLive(live.dataset.esppLive, live);
      const year = e.target.closest("[data-espp-year] button");
      if (year) set("ui.esppYear", year.dataset.v);
    });
    document.addEventListener("input", (e) => {
      const month = e.target.dataset.esppEntry;
      if (month) {
        const key2 = e.target.dataset.key;
        update((s) => {
          const row = { ...s.espp.entries[month] ?? {} };
          if (e.target.value.trim()) row[key2] = e.target.value.trim();
          else delete row[key2];
          if (Object.keys(row).length) s.espp.entries[month] = row;
          else delete s.espp.entries[month];
        });
        return;
      }
      const bind = e.target.dataset.bind ?? "";
      if (bind === "espp.assumptions.price" || bind === "espp.assumptions.fx") e.target.classList.remove("rate-ok", "rate-error");
    });
    document.addEventListener("focusout", (e) => {
      if (e.target.dataset.esppEntry) setTimeout(onChanged);
    });
  }
  function syncEsppCounts(state2) {
    const locked = Object.keys(state2.espp.entries).length;
    $$("[data-espp-locked]").forEach((b) => b.textContent = locked ? String(locked) : "");
  }

  // js/ui/history.js
  var CURRENT = {
    salary: (s) => s.per === "month" ? s.amount : "",
    transport: (s) => s.incomes.find((i) => i.name?.toLowerCase().startsWith("transport"))?.amount ?? "",
    medical: (s) => s.deductions.find((d) => d.name?.toLowerCase().startsWith("medical"))?.amount ?? "",
    esppConst: (s) => s.espp.constPct,
    esppVar: (s) => s.espp.varPct
  };
  var currentValues = (s) => Object.fromEntries(HISTORY_FIELDS.map((f) => [f.id, CURRENT[f.id](s)]));
  var draft = null;
  var draftMonth = "";
  var confirmDelete = false;
  var fmt = (field, value, money) => value === "" ? "\u2014" : field.unit === "pct" ? `${escapeHtml(value)}%` : money(toNumber(value));
  function selectedMonth(state2, months) {
    const chosen = state2.ui.histMonth;
    if (chosen && (months.some((m) => m.month === chosen) || chosen === draftMonth)) return chosen;
    return months[0]?.month ?? "";
  }
  function savedList(state2, months, active, money) {
    const now = monthKey(/* @__PURE__ */ new Date());
    const rows = months.map(({ month, fields }) => {
      const salary = valueAt(state2.history, "salary", month);
      const tag = month === now ? ' <span class="hint">now</span>' : "";
      return `<button type="button" class="month-item${month === active ? " on" : ""}" data-hist-pick="${month}">
      <span>${escapeHtml(monthLabel(month, "long"))}${tag}</span>
      <span class="hint">${salary ? money(toNumber(salary)) : "\u2014"} \xB7 ${fields.length} saved</span></button>`;
    }).join("");
    return `<details class="more" data-open="histSaved">
    <summary>Saved months <span class="count">${months.length || ""}</span></summary>
    <div class="inner month-list">${rows || '<div class="hint">No saved months yet. Use <b>Save Month</b> on the Pay tab, or + New.</div>'}</div>
  </details>`;
  }
  function editor(state2, month, money) {
    if (draftMonth !== month) {
      draft = monthValues(state2.history, month);
      draftMonth = month;
      confirmDelete = false;
    }
    const own = new Set(savedMonths(state2.history).find((m) => m.month === month)?.fields ?? []);
    const field = (id, label, unit) => {
      const inherited = !own.has(id) && draft[id] !== "";
      return `<label class="hist-field${inherited ? " inherited" : ""}" title="${inherited ? "Carried over from an earlier month" : ""}">
      <span>${label}</span>
      <input type="text" inputmode="decimal" data-hist-edit="${id}" value="${escapeHtml(draft[id] ?? "")}" placeholder="${unit === "pct" ? "%" : "Amount"}">
      <small>${fmt(historyField(id), draft[id] ?? "", money)}</small></label>`;
    };
    const isSaved = savedMonths(state2.history).some((m) => m.month === month);
    const actions = confirmDelete ? `<span class="confirm">Delete ${escapeHtml(monthLabel(month, "long"))}?
         <button class="btn sm danger" data-hist-act="delete-yes">Delete</button>
         <button class="btn sm ghost" data-hist-act="delete-no">Keep</button></span>` : `<button class="btn sm primary" data-hist-act="save">Save</button>
       ${isSaved ? '<button class="btn sm ghost danger" data-hist-act="delete">Delete month</button>' : ""}`;
    return `<div class="hist-editor">
    <div class="hist-head"><b>${escapeHtml(monthLabel(month, "long"))}</b>${isSaved ? "" : '<span class="hint">not saved yet</span>'}</div>
    ${field("salary", "Gross salary", "money")}
    ${field("transport", "Transportation", "money")}
    ${field("medical", "Medical insurance", "money")}
    <div class="hist-pair">${field("esppConst", "ESPP constant %", "pct")}${field("esppVar", "ESPP variable %", "pct")}</div>
    <div class="row wrap hist-actions">${actions}</div>
  </div>`;
  }
  function monthSummary(state2, month, money) {
    const base = { ...state2, history: draftHistory(state2, month), profile: activeProfile() };
    const input = { ...inputForMonth(base, month), profile: activeProfile() };
    if (!toNumber(input.amount)) return '<div class="hint">Add a gross salary to see this month\u2019s figures.</div>';
    const r = withImpacts(input, calculate(input));
    return `<div class="lines compact">${breakdownLines(r, input, (annual) => money(annual / 12))}</div>`;
  }
  var draftHistory = (state2, month) => draft && draftMonth === month ? saveMonth(state2.history, month, draft).history : state2.history;
  function renderHistory(state2, money) {
    const host = $("#historyList");
    if (!host) return;
    const focused = document.activeElement;
    if (host.contains(focused) && focused.tagName === "INPUT") return;
    const months = savedMonths(state2.history);
    const active = selectedMonth(state2, months);
    host.innerHTML = `${savedList(state2, months, active, money)}
    <div class="row hist-new">
      <input type="month" id="histNewMonth" value="${monthKey(/* @__PURE__ */ new Date())}" aria-label="Month to add">
      <button class="btn sm" data-hist-act="new">+ New month</button>
    </div>
    ${active ? `${editor(state2, active, money)}<div class="section-title">Summary</div><div id="histSummary">${monthSummary(state2, active, money)}</div>` : ""}`;
    lastMoney = money;
  }
  var lastMoney = String;
  function refreshSummary() {
    const host = $("#histSummary");
    if (host && draftMonth) host.innerHTML = monthSummary(getState(), draftMonth, lastMoney);
  }
  function select2(month) {
    set("ui.histMonth", month);
  }
  function save(onChanged) {
    const month = draftMonth;
    const result = saveMonth(getState().history, month, draft);
    if (!result.saved) return toast("Enter at least one value to save");
    update((s) => {
      s.history = result.history;
      s.ui.histMonth = month;
    });
    draftMonth = "";
    toast(`${result.replaced ? "Updated" : "Saved"} ${monthLabel(month, "long")}`);
    onChanged();
  }
  function addMonth(onChanged) {
    const month = $("#histNewMonth")?.value || monthKey(/* @__PURE__ */ new Date());
    if (savedMonths(getState().history).some((m) => m.month === month)) {
      select2(month);
      toast(`${monthLabel(month, "long")} is already saved \u2014 opened it`);
      return onChanged();
    }
    draft = { ...currentValues(getState()) };
    draftMonth = month;
    confirmDelete = false;
    select2(month);
    onChanged();
  }
  function initHistory(onChanged) {
    document.addEventListener("click", (e) => {
      const pick2 = e.target.closest("[data-hist-pick]");
      if (pick2) {
        select2(pick2.dataset.histPick);
        return onChanged();
      }
      const act = e.target.closest("[data-hist-act]")?.dataset.histAct;
      if (!act) return;
      if (act === "save") return save(onChanged);
      if (act === "new") return addMonth(onChanged);
      if (act === "delete") confirmDelete = true;
      else if (act === "delete-no") confirmDelete = false;
      else if (act === "delete-yes") {
        const month = draftMonth;
        update((s) => {
          s.history = removeMonth(s.history, month);
          s.ui.histMonth = "";
        });
        draftMonth = "";
        toast(`Deleted ${monthLabel(month, "long")}`);
      }
      onChanged();
    });
    document.addEventListener("input", (e) => {
      const id = e.target.dataset.histEdit;
      if (!id || !draft) return;
      draft[id] = e.target.value;
      const small = e.target.parentElement.querySelector("small");
      if (small) small.innerHTML = fmt(historyField(id), e.target.value, lastMoney);
      refreshSummary();
    });
    document.addEventListener("change", (e) => {
      if (e.target.dataset.histEdit) onChanged();
    });
  }

  // js/ui/saveMonth.js
  function initSaveMonth(onChanged) {
    const panel = $("#saveMonthPanel");
    const select3 = $("#saveMonthSel");
    const picker = $("#saveMonthPick");
    const ask = $("#saveMonthAsk");
    let pending = "";
    function close() {
      panel.hidden = true;
      ask.hidden = true;
      pending = "";
    }
    function commit2(month) {
      const state2 = getState();
      const result = saveMonth(state2.history, month, currentValues(state2));
      if (!result.saved) return toast("Nothing to save \u2014 fill the Pay tab first");
      update((s) => {
        s.history = result.history;
      });
      close();
      toast(`${result.replaced ? "Updated" : "Saved"} ${monthLabel(month, "long")}`);
      onChanged();
    }
    function save2(month) {
      if (!hasMonth(getState().history, month)) return commit2(month);
      pending = month;
      $("#saveMonthAskText").textContent = `${monthLabel(month, "long")} is already saved. Override it?`;
      ask.hidden = false;
    }
    $("#saveMonthBtn").addEventListener("click", () => {
      const now = monthKey(/* @__PURE__ */ new Date());
      const months = nearestFirst(monthsInHistory(getState().history), now);
      select3.innerHTML = [
        '<option value="custom">Custom\u2026</option>',
        ...months.map((m) => `<option value="${m}">${monthLabel(m, "long")}</option>`)
      ].join("");
      select3.value = "custom";
      picker.value = now;
      picker.hidden = true;
      ask.hidden = true;
      panel.hidden = false;
    });
    select3.addEventListener("change", () => {
      ask.hidden = true;
      if (select3.value === "custom") {
        picker.hidden = false;
        picker.showPicker?.();
      } else save2(select3.value);
    });
    picker.addEventListener("change", () => {
      if (picker.value) save2(picker.value);
    });
    $("#saveMonthYes").addEventListener("click", () => {
      if (pending) commit2(pending);
    });
    $("#saveMonthNo").addEventListener("click", () => {
      ask.hidden = true;
      pending = "";
    });
    $("#saveMonthCancel").addEventListener("click", close);
  }

  // js/main.js
  function compute(input) {
    const amount = toNumber(input.amount);
    if (amount <= 0) return null;
    const result = input.mode === "net" ? solveForNet(input, toAnnual(amount, input.per, input.schedule)) : calculate(input);
    return withImpacts(input, result);
  }
  function computeProRata(input, full, factor) {
    if (!full || factor === 1) return full;
    const adjusted = proRataInput(input, factor);
    return withImpacts(adjusted, calculate(adjusted, full.baseAnnual));
  }
  function render(state2) {
    const input = { ...state2, profile: activeProfile() };
    const money = createMoneyFormatter(input.profile.currency);
    const result = compute(input);
    const pay = resolvePayPeriod(state2.payPeriod);
    pay.result = computeProRata(input, result, pay.factor);
    syncTabs(state2);
    syncCollapsibles(state2);
    syncBindings(state2);
    syncProfiles(state2);
    syncSettings(state2);
    setListContext({
      currency: input.profile.currency,
      money,
      factor: pay.factor,
      impacts: { overtime: pay.result?.overtime ?? [], cashAwards: pay.result?.cashAwards ?? [] }
    });
    renderResults(result, input, money, pay);
    renderEsppInputs(pay.result ?? result, money);
    syncEsppCounts(state2);
    if (state2.ui.inTab === "history") {
      renderHistory(state2, money);
      syncCollapsibles(state2);
    }
    if (state2.ui.resTab === "espp") renderEsppTab(esppReport(input), money);
  }
  function rebuild() {
    const state2 = getState();
    fillSelects(state2);
    renderAllLists();
    render(state2);
  }
  initTabs();
  initBindings();
  initLists();
  initCollapsibles();
  initProfiles(rebuild);
  initResults();
  initSettings(rebuild);
  initSteppers();
  initRateFetcher();
  initEspp(rebuild);
  initHistory(rebuild);
  initSaveMonth(rebuild);
  subscribe(render);
  rebuild();
})();
