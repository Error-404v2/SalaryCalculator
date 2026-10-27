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
      { name: "Medical insurance", amount: "230.8", per: "month", pretax: false },
      { name: "Loan", amount: "", per: "month", pretax: false }
    ]
  };
  var BLANK_ROWS = {
    incomes: { name: "", amount: "", per: "once", taxable: true, insurable: false },
    cashAwards: { name: "Cash Award", amount: "", currency: "USD", rate: "", per: "once", taxable: true },
    deductions: { name: "", amount: "", per: "month", pretax: false },
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
    if (!(toNumber(espp?.constPct) > 0 || toNumber(espp?.varPct) > 0)) return { constant: 0, variable: 0, total: 0, constBase: 0, varBase: 0 };
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
    const esppGain = toAnnual(input.espp?.gain, "once", schedule);
    const grossTaxable = baseAnnual + taxableExtras + overtimeAnnual + esppGain;
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
    const totalDeductions = si.employee + incomeTax + leviesTotal + preTax + postTax + espp.total + esppGain;
    const net = grossAnnual - totalDeductions;
    const employeeGovTake = si.employee + incomeTax + leviesTotal;
    const employerCost = grossAnnual + si.employer;
    const ratio = (a, b) => b > 0 ? a / b : 0;
    const esppGainTax = esppGain > 0 ? incomeTax + leviesTotal - (({ incomeTax: t, leviesTotal: l }) => t + l)(calculate({ ...input, espp: { ...input.espp, gain: "" } }, baseAnnualOverride)) : 0;
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
      esppGain,
      esppGainTax,
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
    { id: "esppConst", label: "Stocks % (constant)", unit: "pct" },
    { id: "esppVar", label: "Stocks % (variable)", unit: "pct" }
  ];
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

  // js/core/months.js
  var PAY_KEYS = ["amount", "per", "mode", "payPeriod", "jobType", "overrides", "incomes", "overtime", "cashAwards", "deductions", "espp"];
  var ESPP_KEYS = ["constPct", "varPct", "variable", "gain"];
  var PAY_PATHS = [...PAY_KEYS.filter((k) => k !== "espp"), ...ESPP_KEYS.map((k) => `espp.${k}`)];
  var isPayPath = (path) => PAY_PATHS.some((p) => path === p || path.startsWith(`${p}.`));
  function snapshotPay(state2) {
    const pay = {};
    for (const key2 of PAY_KEYS) {
      if (key2 === "espp") pay.espp = Object.fromEntries(ESPP_KEYS.map((k) => [k, clone(state2.espp?.[k] ?? "")]));
      else pay[key2] = clone(state2[key2]);
    }
    return pay;
  }
  function grossPay(pay, context) {
    if (pay.mode !== "net" || !(toNumber(pay.amount) > 0)) return { ...clone(pay), mode: "gross" };
    const input = { ...context, ...withPay(context, pay) };
    const solved = solveForNet(input, toAnnual(pay.amount, pay.per, input.schedule));
    const gross = fromAnnual(solved.baseAnnual, pay.per, input.schedule);
    return { ...clone(pay), mode: "gross", amount: String(Math.round(gross * 100) / 100) };
  }
  function withPay(state2, pay) {
    if (!pay) return state2;
    const next = { ...state2 };
    for (const key2 of PAY_KEYS) {
      if (!(key2 in pay)) continue;
      next[key2] = key2 === "espp" ? { ...state2.espp, ...clone(pay.espp) } : clone(pay[key2]);
    }
    return next;
  }
  function applyPay(state2, pay) {
    for (const key2 of PAY_KEYS) {
      if (!(key2 in pay)) continue;
      if (key2 === "espp") Object.assign(state2.espp, clone(pay.espp));
      else state2[key2] = clone(pay[key2]);
    }
    return state2;
  }
  function monthsWithDraft(months, month, pay, dirty) {
    if (!month || !pay || !(months?.[month] || dirty)) return months ?? {};
    return { ...months, [month]: pay };
  }
  var monthList = (months) => Object.keys(months ?? {}).sort((a, b) => b.localeCompare(a));
  function monthInForce(months, month) {
    return monthList(months).find((m) => m <= month) ?? "";
  }
  var putMonth = (months, month, pay) => ({ ...months ?? {}, [month]: clone(pay) });
  function dropMonth(months, month) {
    const next = { ...months ?? {} };
    delete next[month];
    return next;
  }
  var moveMonth = (months, from, to, pay) => putMonth(from && from !== to ? dropMonth(months, from) : months, to, pay);
  function monthChoices(months, now, lastCustom = "") {
    const choices = nearestFirst(monthList(months), now).map((month) => ({ month, saved: true }));
    if (lastCustom && !months?.[lastCustom]) choices.push({ month: lastCustom, saved: false });
    return choices;
  }
  var FIELD_TO_ITEM = { transport: ["incomes", "transport", "Transportation"], medical: ["deductions", "medical", "Medical insurance"] };
  function monthsFromHistory(history, base) {
    const entries = (history ?? []).filter((e) => e && e.from && HISTORY_FIELDS.some((f) => f.id === e.field) && isFilled(e.value));
    const froms = [...new Set(entries.map((e) => e.from))].sort();
    const months = {};
    for (const month of froms) {
      const pay = snapshotPay(base);
      const latest3 = (field) => entries.filter((e) => e.field === field && e.from <= month).sort((a, b) => a.from.localeCompare(b.from)).at(-1);
      const salary = latest3("salary");
      if (salary) {
        pay.amount = salary.value;
        pay.per = "month";
        pay.mode = "gross";
      }
      for (const [field, [list, prefix, name]] of Object.entries(FIELD_TO_ITEM)) {
        const entry = latest3(field);
        if (!entry) continue;
        const i = pay[list].findIndex((it) => it.name?.toLowerCase().startsWith(prefix));
        if (i >= 0) pay[list][i] = { ...pay[list][i], amount: entry.value };
        else pay[list].push(list === "incomes" ? { name, amount: entry.value, per: "month", taxable: true, insurable: false } : { name, amount: entry.value, per: "month", pretax: false });
      }
      const c = latest3("esppConst");
      const v = latest3("esppVar");
      if (c) pay.espp.constPct = c.value;
      if (v) pay.espp.varPct = v.value;
      months[month] = pay;
    }
    return months;
  }

  // js/core/espp.js
  var DIVIDEND_MONTHS = /* @__PURE__ */ new Set([3, 6, 9, 12]);
  var FEE_MONTHS = /* @__PURE__ */ new Set([1, 7]);
  var monthNumber = (key2) => Number(key2.slice(5, 7));
  var pick = (typed, calculated) => isFilled(typed) ? { value: toNumber(typed), locked: true } : { value: calculated, locked: false };
  function dividendCash(sharesHeld, { dividend, dividendTax, reinvestRate, reinvestCap }) {
    const gross = sharesHeld * toNumber(dividend);
    const afterTax = gross * (1 - toNumber(dividendTax) / 100);
    const fee = Math.min(afterTax * (toNumber(reinvestRate) / 100), isFilled(reinvestCap) ? toNumber(reinvestCap) : Infinity);
    return { gross, afterTax, fee, net: Math.max(0, afterTax - fee) };
  }
  function buildLedger({ year, entries = {}, assumptions = {}, deductionFor, monthRates: monthRates2 = {} }) {
    const price = toNumber(assumptions.price);
    const discount = toNumber(assumptions.discount) / 100;
    const purchasePrice = price * (1 - discount);
    const fx = toNumber(assumptions.fx);
    const feeIn = toNumber(assumptions.feeIn);
    let shares = 0;
    const sharesHistory = [];
    const rows = monthsOfYear(year).map((month, i) => {
      const entry = entries[month] ?? {};
      const m = monthNumber(month);
      const deducted = pick(entry.deducted, deductionFor(month));
      const rate = toNumber(monthRates2[month]) || fx;
      const deductedUsd = pick(entry.deductedUsd, rate > 0 ? deducted.value / rate : 0);
      const usedRate = deductedUsd.value > 0 ? deducted.value / deductedUsd.value : 0;
      const eligibleShares = sharesHistory[i - 2] ?? 0;
      const div = DIVIDEND_MONTHS.has(m) ? dividendCash(eligibleShares, assumptions) : { gross: 0, afterTax: 0, fee: 0, net: 0 };
      const dividend = pick(entry.dividend, div.net);
      const reinvestFee = dividend.locked ? 0 : div.fee;
      const dividendTax = dividend.locked ? 0 : div.gross - div.afterTax;
      const feesIn = FEE_MONTHS.has(m) && deducted.value > 0 ? feeIn : 0;
      const accredited = deductedUsd.value + dividend.value - feesIn;
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
        rate,
        fxToday: fx,
        usedRate,
        dividend,
        dividendTax,
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
  function summarize(ledger, { cutoff, assumptions = {} }) {
    const rows = cutoff ? ledger.rows.filter((r) => r.month <= cutoff) : ledger.rows;
    const last = rows.at(-1);
    const shares = last ? last.shares.value : 0;
    const deducted = sum(rows, (r) => r.deducted.value);
    const deductedUsd = sum(rows, (r) => r.deductedUsd.value);
    const untaxed = sum(rows, (r) => r.untaxed);
    const dividends = sum(rows, (r) => r.dividend.value);
    const fees = sum(rows, (r) => r.reinvestFee + r.feesIn);
    const dividendTax = sum(rows, (r) => r.dividendTax ?? 0);
    const withdrawalFee = toNumber(assumptions.withdrawalFee);
    const marketValueUsd = shares * ledger.price;
    const withdrawalUsd = Math.max(0, marketValueUsd - withdrawalFee);
    const withdrawal = withdrawalUsd * ledger.fx;
    return {
      months: rows.length,
      shares,
      deducted,
      deductedUsd,
      untaxed,
      dividends,
      dividendTax,
      fees,
      marketValueUsd,
      withdrawalFee,
      withdrawalUsd,
      withdrawal,
      profit: withdrawal - deducted
    };
  }
  function adjustedMonth(today, changeDay, offset = 0) {
    const settledThisMonth = today.getDate() >= toNumber(changeDay || 1);
    const shift = (settledThisMonth ? 0 : -1) + toNumber(offset);
    const d = new Date(today.getFullYear(), today.getMonth() + shift, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // js/core/esppForecast.js
  var esppDeductionFor = (input) => (month) => {
    const saved = input.months?.[month];
    return saved ? calculate(withPay(input, saved)).espp.total / 12 : 0;
  };
  function deductionSource(input, month) {
    return input.months?.[month] ? { kind: "month", month } : { kind: "none", month: "" };
  }
  function payslipGainFor(input, month) {
    const entry = input.espp?.entries?.[month] ?? {};
    const typedGain = entry.gain !== void 0 && entry.gain !== "";
    const typedTax = entry.gainTax !== void 0 && entry.gainTax !== "";
    const saved = input.months?.[month];
    const savedGain = toNumber(saved?.espp?.gain) > 0;
    if (!typedGain && !savedGain && !typedTax) return { gain: 0, tax: 0, source: "", taxTyped: false };
    const base = saved ? withPay(input, saved) : input;
    const r = calculate({ ...base, espp: { ...base.espp, gain: typedGain ? entry.gain : savedGain ? saved.espp.gain : "" } });
    return {
      gain: typedGain || savedGain ? r.esppGain / 12 : 0,
      tax: typedTax ? toNumber(entry.gainTax) : r.esppGainTax / 12,
      source: typedGain ? "typed" : savedGain ? "history" : "",
      taxTyped: typedTax
    };
  }
  function esppReport(input, today = /* @__PURE__ */ new Date()) {
    const espp = input.espp;
    const year = Number(input.ui.esppYear || today.getFullYear());
    const ledger = buildLedger({
      year,
      entries: espp.entries,
      assumptions: espp.assumptions,
      deductionFor: esppDeductionFor(input),
      monthRates: input.esppRates ?? {}
    });
    ledger.rows.forEach((row) => {
      row.source = deductionSource(input, row.month);
      row.payslip = payslipGainFor(input, row.month);
    });
    const cutoff = adjustedMonth(today, espp.changeDay, espp.monthOffset);
    const options = { assumptions: espp.assumptions };
    const gainTotals = (rows) => ({
      payslipGain: sum(rows, (r) => r.payslip.gain),
      payslipTax: sum(rows, (r) => r.payslip.tax)
    });
    return {
      year,
      ledger,
      cutoff,
      currentMonth: monthKey(today),
      toDate: { ...summarize(ledger, { ...options, cutoff }), ...gainTotals(ledger.rows.filter((r) => r.month <= cutoff)) },
      forecast: { ...summarize(ledger, options), ...gainTotals(ledger.rows) },
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
  var grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  function groupDigits(value) {
    const raw = String(value ?? "").replace(/,/g, "").trim();
    return /^-?\d+(\.\d+)?$/.test(raw) ? grouped.format(Number(raw)) : String(value ?? "");
  }

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
  var DEFAULT_WITHDRAWAL_FEE = "54.95";
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
      constPct: "",
      varPct: "",
      /** ESPP gain on this month's payslip (EGP): taxed as pay, then taken back out ("ESPP gain offset"). */
      gain: "",
      variable: { allowances: true, overtime: true, cashAwards: true, exempt: true },
      symbol: "IBM",
      assumptions: {
        price: "",
        fx: "",
        discount: "15",
        dividend: "",
        dividendTax: "15",
        reinvestRate: "2",
        reinvestCap: "3",
        feeIn: "6",
        withdrawalFee: DEFAULT_WITHDRAWAL_FEE
      },
      changeDay: "30",
      monthOffset: "0",
      entries: {},
      /** USD rate per month ("YYYY-MM" → rate): the average of the 19th–21st, fetched for past months. */
      rates: {}
    },
    /** Dated values: { field, from: 'YYYY-MM', value }. The latest `from` on or before a month applies. */
    history: [],
    /** Saved months: "YYYY-MM" → a full copy of the Pay tab inputs for that month (see core/months.js). */
    months: {},
    ui: {
      inTab: "pay",
      resTab: "summary",
      esppYear: "",
      histMonth: "",
      period: "month",
      theme: "",
      taxEdit: false,
      open: { overtime: false, extras: false, deductions: false, espp: false, options: false, settings: false, brackets: false, exemption: false, levies: false, si: false, jobs: false, esppTable: true, esppAssumptions: false, esppVariable: false, histSaved: true, histSummary: true }
    }
  });

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
    if (!String(state2.espp.assumptions.withdrawalFee ?? "").trim()) state2.espp.assumptions.withdrawalFee = DEFAULT_WITHDRAWAL_FEE;
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
    const rates = {};
    for (const [month, rate] of Object.entries(saved?.espp?.rates ?? {})) {
      if (MONTH.test(month) && Number(rate) > 0) rates[month] = String(rate);
    }
    state2.espp.rates = rates;
    state2.history = (state2.history ?? []).filter((h) => h && typeof h === "object" && h.field);
    return state2;
  }
  function restoreMonths(state2, saved) {
    const raw = saved?.months;
    const months = {};
    if (raw && typeof raw === "object") {
      for (const [month, pay] of Object.entries(raw)) {
        if (MONTH.test(month) && pay && typeof pay === "object" && "amount" in pay) months[month] = pay;
      }
    }
    state2.months = Object.keys(months).length || raw ? months : monthsFromHistory(state2.history, state2);
    return state2;
  }
  function grossMonths(state2) {
    const context = { ...state2, profile: state2.profiles.find((p) => p.id === state2.profileId) ?? state2.profiles[0] };
    for (const [month, pay] of Object.entries(state2.months)) {
      if (pay.mode === "net") state2.months[month] = grossPay(pay, context);
    }
    return state2;
  }
  function hydrate(saved) {
    const upgraded = upgradeV1(saved);
    return grossMonths(sanitize(restoreMonths(restoreEntries(mergeShape(DEFAULT_STATE, upgraded), upgraded), upgraded)));
  }

  // js/state/store.js
  var PROFILE_PREFIX = "@";
  var listeners = /* @__PURE__ */ new Set();
  var state = hydrate(loadSaved());
  var scope = null;
  var getState = () => state;
  var view = () => scope ? withPay(state, scope.pay) : state;
  var scopeMonth = () => scope?.month ?? "";
  var scopePay = () => scope?.pay ?? null;
  var scopeDirty = () => !!scope && JSON.stringify(scope.pay) !== JSON.stringify(scope.base);
  function setScope(month, pay, base = pay) {
    scope = month ? { month, pay: clone(pay), base: clone(base) } : null;
    commit();
  }
  function markScopeSaved() {
    if (scope) scope.base = clone(scope.pay);
  }
  var activeIndex = () => Math.max(0, state.profiles.findIndex((p) => p.id === state.profileId));
  var activeProfile = () => state.profiles[activeIndex()];
  function resolve(path) {
    if (path === PROFILE_PREFIX) return `profiles.${activeIndex()}`;
    return path.startsWith(`${PROFILE_PREFIX}.`) ? `profiles.${activeIndex()}${path.slice(1)}` : path;
  }
  var scoped = (path) => !!scope && isPayPath(path);
  var get = (path) => scoped(path) ? getPath(scope.pay, path) : getPath(state, resolve(path));
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function commit() {
    saveDebounced(state);
    const current = view();
    listeners.forEach((fn) => fn(current));
  }
  function set(path, value) {
    if (scoped(path)) setPath(scope.pay, path, value);
    else setPath(state, resolve(path), value);
    commit();
  }
  function update(mutator) {
    mutator(state);
    commit();
  }
  function replace(next) {
    const theme = state.ui.theme;
    state = hydrate(next);
    scope = null;
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
      if (path) set(path, e.target.hasAttribute("data-money") ? e.target.value.replace(/,/g, "") : readValue(e.target));
    });
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-seg] button[data-v]");
      if (btn) set(btn.closest("[data-seg]").dataset.seg, btn.dataset.v);
    });
  }
  function syncBindings(state2) {
    $$("[data-bind]").forEach((el) => {
      const value = get(el.dataset.bind);
      if (el.type === "checkbox") el.checked = !!value;
      else if (document.activeElement !== el) el.value = el.hasAttribute("data-money") ? groupDigits(value) : value ?? "";
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
    const open3 = isAdvancedOpen(path, index);
    return `<div class="adv${open3 ? " open" : ""}">
    <div class="adv-body"${open3 ? "" : " inert"}>${innerHtml}</div>
    <button type="button" class="adv-toggle" data-adv="${path}" data-i="${index}" aria-expanded="${open3}">${label}${CHEVRON}</button></div>`;
  }
  function handleAdvancedToggle(button) {
    const path = button.dataset.adv;
    const index = Number(button.dataset.i);
    const open3 = !openRows.delete(key(path, index));
    if (open3) openRows.add(key(path, index));
    const wrap = button.closest(".adv");
    wrap.classList.toggle("open", open3);
    button.setAttribute("aria-expanded", String(open3));
    wrap.querySelector(".adv-body").toggleAttribute("inert", !open3);
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
    return async (key2, load, fresh = false) => {
      const hit = cache.get(key2);
      if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value;
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
  var CONVERSION_DAYS = [19, 20, 21];
  async function getConversionRate(from, to, month) {
    const days = CONVERSION_DAYS.map((d) => `${month}-${String(d).padStart(2, "0")}`);
    const rates = (await Promise.allSettled(days.map((date) => getRate(from, to, date)))).filter((r) => r.status === "fulfilled").map((r) => r.value.rate);
    if (!rates.length) throw new Error(`no rate for ${month}`);
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }
  async function getRate(from, to, date = "", fresh = false) {
    const { value, source } = await cached(`${from}>${to}@${date}`, () => firstValid(sources(from, to, date), (s, data) => s.read(data)), fresh);
    return { rate: value, source };
  }

  // js/ui/spin.js
  var MIN_SPIN_MS = 800;
  var latest = /* @__PURE__ */ new Map();
  var spinning = /* @__PURE__ */ new Set();
  var wait = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
  var buttonsOf = (target) => typeof target === "string" ? [...globalThis.document?.querySelectorAll(target) ?? []] : [target];
  async function spinWhile(target, task, minMs = MIN_SPIN_MS) {
    const id = (latest.get(target) ?? 0) + 1;
    latest.set(target, id);
    spinning.add(target);
    buttonsOf(target).forEach((b) => {
      b.classList.remove("loading");
      void b.offsetWidth;
      b.classList.add("loading");
    });
    const [result] = await Promise.allSettled([task(), wait(minMs)]);
    if (latest.get(target) === id) {
      spinning.delete(target);
      buttonsOf(target).forEach((b) => b.classList.remove("loading"));
    }
    if (result.status === "rejected") throw result.reason;
    return result.value;
  }
  function reapplySpin() {
    spinning.forEach((target) => buttonsOf(target).forEach((b) => b.classList.add("loading")));
  }

  // js/ui/rateFetcher.js
  var RATE_DECIMALS = 4;
  var status = /* @__PURE__ */ new Map();
  var latest2 = /* @__PURE__ */ new Map();
  var rateStatus = (index) => status.get(index) ?? "";
  function paint(index) {
    const input = $(`[data-path="cashAwards.${index}.rate"]`);
    const button = $(`[data-fetch-rate="${index}"]`);
    const state2 = rateStatus(index);
    input?.classList.toggle("rate-ok", state2 === "ok");
    input?.classList.toggle("rate-error", state2 === "error");
    button?.classList.toggle("loading", state2 === "loading");
  }
  async function fetchRateFor(index, button) {
    const award = get("cashAwards")[index];
    const to = activeProfile().currency;
    if (!award || award.currency === to) return;
    const run = (latest2.get(index) ?? 0) + 1;
    latest2.set(index, run);
    status.set(index, "loading");
    paint(index);
    try {
      const { rate, source } = await spinWhile(button, () => getRate(award.currency, to, "", true));
      if (latest2.get(index) !== run) return;
      set(`cashAwards.${index}.rate`, String(Number(rate.toFixed(RATE_DECIMALS))));
      status.set(index, "ok");
      const input = $(`[data-path="cashAwards.${index}.rate"]`);
      if (input) {
        input.value = get(`cashAwards.${index}.rate`);
        input.title = `Live rate from ${source}`;
      }
    } catch (err) {
      if (latest2.get(index) !== run) return;
      status.set(index, "error");
      const input = $(`[data-path="cashAwards.${index}.rate"]`);
      if (input) input.title = `Could not get a live rate (${err.message}). Enter it manually.`;
    }
    paint(index);
  }
  function initRateFetcher() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-fetch-rate]");
      if (btn) fetchRateFor(Number(btn.dataset.fetchRate), btn);
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
  var text = (path, i, key2, value, placeholder = "", { numeric = false, disabled = false, cls = "", money = false } = {}) => `<input type="text" class="${cls}"${numeric ? ' inputmode="decimal"' : ""}${money ? " data-money" : ""}${disabled ? " disabled" : ""} data-path="${path}.${i}.${key2}"
    value="${escapeHtml(money ? groupDigits(value) : value)}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder || key2)}">`;
  var num = (path, i, key2, value, placeholder, extra = {}) => text(path, i, key2, value, placeholder, { ...extra, numeric: true });
  var check = (path, i, key2, value, label) => `<label class="check"><input type="checkbox" data-path="${path}.${i}.${key2}"${value ? " checked" : ""} aria-label="${escapeHtml(label || key2)}"> ${label}</label>`;
  var select = (path, i, key2, optionsHtml, cls = "") => `<select class="${cls}" data-path="${path}.${i}.${key2}" aria-label="${key2}">${optionsHtml}</select>`;
  var OT_OPTIONS = [...OT_TYPES.map((t) => ({ value: t.id, label: `${t.label} \xD7${t.mult}` })), { value: "custom", label: "Custom\u2026" }];
  var MODE_OPTIONS = [{ value: "progressive", label: "Brackets" }, { value: "flat", label: "Flat" }];
  var LEVY_BASES = [{ value: "gross", label: "Gross" }, { value: "taxable", label: "Taxable" }];
  var ROW_TEMPLATES = {
    incomes: (it, i) => `<div class="item income">
    ${text("incomes", i, "name", it.name, "Name")}${num("incomes", i, "amount", it.amount, "Amount", { money: true })}
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
      <button type="button" class="btn sm ghost live${rateStatus(i) === "loading" ? " loading" : ""}" data-fetch-rate="${i}" title="Get the current rate online">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>Live rate</button></div>`;
      const impact = ctx2.impacts.cashAwards[i];
      const net = impact && impact.annual > 0 ? `<div class="impact"><span>${ctx2.money(impact.annual * ctx2.factor)} gross / yr</span><b>${ctx2.money(impact.netAnnual * ctx2.factor)} net / yr</b></div>` : "";
      return `<div class="item award">
      ${text("cashAwards", i, "name", it.name, "Name")}${num("cashAwards", i, "amount", it.amount, "Amount", { money: true })}
      ${select("cashAwards", i, "currency", optionList(currencies, it.currency))}${removeBtn("cashAwards", i)}
      ${foreign ? rateRow : ""}
      ${advanced("cashAwards", i, `${select("cashAwards", i, "per", periodOptions(it.per, itemPeriods("cashAwards", it)), "xs-select")}${check("cashAwards", i, "taxable", it.taxable, "Taxable")}`)}
      ${net}</div>`;
    },
    deductions: (it, i) => `<div class="item income">
    ${text("deductions", i, "name", it.name, "Name")}${num("deductions", i, "amount", it.amount, "Amount", { money: true })}
    ${select("deductions", i, "per", periodOptions(it.per, itemPeriods("deductions", it)))}${removeBtn("deductions", i)}
    ${advanced("deductions", i, check("deductions", i, "pretax", it.pretax, "Before tax (reduces taxable income)"))}</div>`,
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
  var ESPP_CHIP = '<button type="button" class="chip" data-espp-show id="esppChip">+ Stocks</button>';
  function renderPresets() {
    $$("[data-presets]").forEach((host) => {
      const kind = host.dataset.presets;
      host.innerHTML = PRESETS[kind].map((p, i) => `${kind === "deductions" && p.name === "Loan" ? ESPP_CHIP : ""}<button class="chip" data-preset="${kind}" data-i="${i}">+ ${escapeHtml(p.name)}</button>`).join("");
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
    if (AFFECTS_SELECTS.includes(path)) fillSelects(view());
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
      if (path && e.target.tagName !== "SELECT") {
        const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        set(path, e.target.hasAttribute("data-money") ? String(value).replace(/,/g, "") : value);
      }
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
      if (AFFECTS_SELECTS.some((src) => path.startsWith(`${src}.`))) fillSelects(view());
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
      const open3 = !!state2.ui.open[el.dataset.open];
      if (el.open !== open3) el.open = open3;
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
    const select2 = $("#currencySel");
    const input = $("#currencyCustom");
    const custom = forceCustom || !CURRENCIES.includes(profile.currency);
    select2.innerHTML = optionList(
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
  function breakdownLines(r, state2, at, { net = true, entered = false } = {}) {
    const mine = entered ? " entered" : "";
    const sub = (label, annual, netAnnual) => line(`${label}${netAnnual !== void 0 ? ` <span class="hint">net ${at(netAnnual)}</span>` : ""}`, positive(at(annual)), `sub${mine}`);
    const earnings = [
      line("Basic salary", positive(at(r.baseAnnual)), mine.trim()),
      ...r.incomes.map((it) => sub(escapeHtml(it.name) + (it.taxable ? "" : ' <span class="hint">(exempt)</span>'), it.annual)),
      ...r.overtime.filter((o) => o.annual).map((o) => sub(escapeHtml(o.label), o.annual, o.netAnnual)),
      ...r.cashAwards.filter((a) => a.annual).map((a) => sub(escapeHtml(a.name), a.annual, a.netAnnual)),
      r.esppGain ? line(`ESPP gain <span class="hint">taxed, then offset</span>`, positive(at(r.esppGain)), `sub${mine}`) : "",
      line("Gross pay", positive(at(r.grossAnnual)), "strong")
    ];
    const siNote = r.si.enabled ? `${escapeHtml(state2.profile.si.employeeRate)}%` : "n/a";
    const taxNote = r.flat ? ` <span class="hint">flat ${r.marginalRate}%</span>` : "";
    const deductions = [
      line(`Social insurance <span class="hint">${siNote}</span>`, negative(at(r.si.employee)), "sep", COLORS.si),
      line(`Income tax${taxNote}`, negative(at(r.incomeTax)), "", COLORS.tax),
      ...r.levies.filter((l) => l.annual).map((l) => line(escapeHtml(l.name), negative(at(l.annual)), "", COLORS.tax)),
      ...r.deductions.map((d) => line(escapeHtml(d.name), negative(at(d.annual)), mine.trim(), COLORS.other)),
      r.espp.total ? line("Stocks", negative(at(r.espp.total)), mine.trim(), COLORS.other) : "",
      r.esppGain ? line(`ESPP gain offset <span class="hint">extra tax ${at(r.esppGainTax)}</span>`, negative(at(r.esppGain)), mine.trim(), COLORS.other) : "",
      line("Total deductions", negative(at(r.totalDeductions)), "strong sep"),
      net ? line("Net pay", at(r.net), "strong net-line") : ""
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
    const next = String(stepValue(input.value, delta, limitOf(input, "min", 0), limitOf(input, "max", Infinity)));
    set(input.dataset.bind, next);
    input.value = input.hasAttribute("data-money") && document.activeElement !== input ? groupDigits(next) : next;
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
  async function getStockPrice(symbol, fresh = false) {
    const clean = String(symbol || "").trim().toUpperCase();
    if (!clean) throw new Error("No symbol set");
    const { value, source } = await cached2(clean, () => firstValid(sources2(clean), (_, data) => {
      if (data.Information || data.Note) throw new Error("demo key only covers a few symbols, such as IBM");
      return data["Global Quote"]?.["05. price"];
    }), fresh);
    return { price: value, source };
  }

  // js/ui/espp.js
  var REFRESH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>';
  var LOCKABLE = [
    { key: "deducted", label: "Deducted", decimals: 2 },
    { key: "deductedUsd", label: "Deducted USD", decimals: 2 },
    { key: "dividend", label: "Dividend", decimals: 2 },
    { key: "shares", label: "ACC. Shares", decimals: 5 }
  ];
  var fixed = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : "";
  var usd = (v, d = 2) => `$${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  var esppAdded = false;
  var hasEsppPct = (s) => toNumber(s.espp.constPct) > 0 || toNumber(s.espp.varPct) > 0 || toNumber(s.espp.gain) > 0;
  var esppShown = (s) => esppAdded || hasEsppPct(s);
  function renderEsppInputs(result, money, state2) {
    const block = $("#esppBlock");
    if (!block) return;
    const shown = esppShown(state2);
    block.hidden = !shown;
    $$("[data-espp-show]").forEach((b) => b.hidden = shown);
    const count = state2.deductions.length + (shown ? 1 : 0);
    $$("[data-deduction-count]").forEach((b) => b.textContent = count ? String(count) : "");
    if (!shown) return;
    const e = result?.espp;
    $("#esppTile").innerHTML = e?.total ? `<div><span>Constant</span><b>${money(e.constant / 12)}</b></div>
       <div><span>Variable</span><b>${money(e.variable / 12)}</b></div>
       <div class="tot"><span>Total / month</span><b>${money(e.total / 12)}</b></div>` : '<div class="hint">Enter a % above 0 to deduct part of your pay into shares.</div>';
    renderGainTile(result, money);
  }
  function renderGainTile(result, money) {
    const tile2 = $("#esppGainTile");
    const gain = (result?.esppGain ?? 0) / 12;
    tile2.hidden = !(gain > 0);
    if (!gain) return;
    const tax = (result.esppGainTax ?? 0) / 12;
    tile2.innerHTML = `<div><span>ESPP Gains</span><b>${money(gain)}</b></div>
    <div><span>Extra tax</span><b>${money(tax)}</b></div>
    <div class="tot"><span>Net cost</span><b>${money(tax)}</b></div>`;
  }
  function resetEsppAdded() {
    esppAdded = false;
  }
  function tile(label, a, b, tone = "") {
    const sign = (x) => x.n > 5e-3 ? "pos" : x.n < -5e-3 ? "neg" : "";
    return `<div class="etile ${tone}"><div class="k">${label}</div>
    <div class="pair"><div><b class="${sign(a)}">${a.v}</b><small>${a.k}</small></div><div><b class="${sign(b)}">${b.v}</b><small>${b.k}</small></div></div></div>`;
  }
  function topTiles(rep, money) {
    const label = monthLabel(rep.cutoff);
    return `<div class="etiles">
    ${tile("Withdrawal", { v: money(rep.toDate.withdrawal), k: `to ${label}` }, { v: money(rep.forecast.withdrawal), k: `${rep.year} forecast` }, "w")}
    ${tile("Profit", { v: money(rep.toDate.profit - rep.toDate.payslipTax), n: rep.toDate.profit - rep.toDate.payslipTax, k: `to ${label}` }, { v: money(rep.forecast.profit - rep.forecast.payslipTax), n: rep.forecast.profit - rep.forecast.payslipTax, k: `${rep.year} forecast` }, "p")}
    ${tile("Shares", { v: formatNumber2(rep.toDate.shares), k: `to ${label}` }, { v: formatNumber2(rep.forecast.shares), k: `${rep.year} forecast` }, "s")}
  </div>`;
  }
  var formatNumber2 = (v) => (Number(v) || 0).toFixed(2);
  function sourceNote(row) {
    const src = row.source;
    if (!src) return "";
    if (src.kind === "month") return `From History (${monthLabel(src.month)})`;
    return "Nothing saved in History for this month";
  }
  function dividendNote(row) {
    if (!row.dividend.value) return "No dividend this month";
    return `After ${usd(row.dividendTax, 4)} US tax and ${usd(row.reinvestFee, 4)} reinvest fee`;
  }
  function cell(row, col) {
    const field = row[col.key];
    const shown = fixed(field.value, col.decimals);
    const fromHistory = col.key === "deducted" && !field.locked && row.source?.kind === "month" && field.value > 0;
    const title = col.key === "deductedUsd" && row.usedRate ? field.locked ? `Your value \u2014 IBM used 1 USD = ${row.usedRate.toFixed(4)} that month. Clear it to go back to the calculated one` : `Calculated at 1 USD = ${row.rate.toFixed(4)} (${row.rate === row.fxToday ? "today's rate" : "avg of the 19th\u201321st"}) \u2014 type Equate's USD to override it` : field.locked ? "Your value \u2014 clear it to go back to the calculated one" : `${col.key === "deducted" ? sourceNote(row) : col.key === "dividend" ? dividendNote(row) : "Calculated"} \u2014 type a value to override it`;
    return `<td class="lock${field.locked ? " on" : ""}${fromHistory ? " hist" : ""}">
    <input type="text" inputmode="decimal" data-espp-entry="${row.month}" data-key="${col.key}"
      value="${field.locked ? escapeHtml(shown) : ""}" placeholder="${shown}" aria-label="${col.label} ${row.month}"
      title="${escapeHtml(title)}"></td>`;
  }
  function payslipCell(row, key2) {
    const p = row.payslip;
    const typed = key2 === "gain" ? p.source === "typed" : p.taxTyped;
    const calculated = key2 === "gain" ? p.gain : p.tax;
    const fromHistory = !typed && p.source === "history";
    const shown = calculated ? fixed(calculated) : "";
    const what = key2 === "gain" ? "ESPP gain" : "Tax on the gain";
    const title = typed ? "Your value \u2014 clear it to use the History month again" : fromHistory ? `${what} from History (${monthLabel(row.month)}) \u2014 type a value to override it` : `No ESPP gain on this payslip \u2014 add it on the Pay/History tab, or type the payslip's ${what.toLowerCase()} here`;
    return `<td class="lock${typed ? " on" : ""}${fromHistory ? " hist" : ""}${key2 === "gainTax" ? " neg-cell" : ""}">
    <input type="text" inputmode="decimal" data-espp-entry="${row.month}" data-key="${key2}"
      value="${typed ? escapeHtml(fixed(calculated)) : ""}" placeholder="${shown || "0.00"}" aria-label="${what} ${row.month}"
      title="${escapeHtml(title)}"></td>`;
  }
  function ledgerTable(rep) {
    const rows = rep.ledger.rows.map((r) => {
      const cls = [r.month > rep.cutoff ? "future" : "", r.month === rep.cutoff ? "active" : ""].join(" ");
      return `<tr class="${cls}"><td><b>${monthLabel(r.month).replace(" " + rep.year, "")}</b></td>
      ${cell(r, LOCKABLE[0])}${cell(r, LOCKABLE[1])}${cell(r, LOCKABLE[2])}
      <td class="r calc">${fixed(r.reinvestFee, 3)}</td><td class="r calc">${fixed(r.feesIn)}</td>
      <td class="r calc">${fixed(r.accredited)}</td>${cell(r, LOCKABLE[3])}
      <td class="r calc">${fixed(r.untaxed)}</td><td class="r calc">${fixed(r.actualShare)}</td>
      ${payslipCell(r, "gain")}${payslipCell(r, "gainTax")}</tr>`;
    }).join("");
    const t = rep.forecast;
    return `<div class="table-wrap espp-table"><table class="edit-table">
    <thead><tr><th>Month</th><th class="y" title="Taken from your pay, EGP">Deducted EGP</th><th class="y" title="US dollars">Deducted USD</th><th class="y" title="US dollars">Dividend $</th>
      <th class="r" title="US dollars">Reinvest fee $</th><th class="r" title="US dollars">Fees in $</th><th class="r" title="US dollars">Accredited $</th><th class="y">ACC. Shares</th>
      <th class="r" title="US dollars: what the shares bought this month are worth minus what went in">Discount gain $</th><th class="r" title="US dollars">Actual share $</th>
      <th class="y" title="ESPP gain on this month's payslip, in EGP">Payslip gain EGP</th><th class="y" title="Extra income tax the payslip gain caused, in EGP">Gain tax EGP</th></tr></thead>
    <tbody>${rows}
      <tr class="total"><td>Total</td><td class="r">${fixed(t.deducted)}</td><td class="r">${fixed(t.deductedUsd)}</td>
        <td class="r">${fixed(t.dividends)}</td><td class="r" colspan="2">${fixed(t.fees)}</td><td></td>
        <td class="r">${fixed(t.shares, 5)}</td><td class="r">${fixed(t.untaxed)}</td><td class="r">${fixed(t.marketValueUsd)}</td>
        <td class="r">${fixed(t.payslipGain)}</td><td class="r">${fixed(t.payslipTax)}</td></tr>
    </tbody></table></div>
    <p class="hint">Yellow columns show the calculated value in grey; type a value to override it, clear it to go back.
      <span class="hist-dot"></span> Deducted, Payslip gain and its tax come from that month's History entry. Months after ${monthLabel(rep.cutoff)} are faded.</p>`;
  }
  var colourOf = (kind, n) => kind === "cost" ? n > 5e-3 ? "neg" : "" : n > 5e-3 ? "pos" : n < -5e-3 ? "neg" : "";
  function breakdown(rep, money) {
    const r = (label, a, b, kind = "") => `<tr><td>${label}</td><td class="r ${colourOf(kind, a[1])}">${a[0]}</td><td class="r ${colourOf(kind, b[1])}">${b[0]}</td></tr>`;
    const plain = (text2) => [text2, 0];
    const cost = (v, fmt) => [v ? `\u2212 ${fmt(v)}` : fmt(0), v];
    const d = rep.toDate, f = rep.forecast;
    const net = (x) => x.profit - x.payslipTax;
    return `<div class="table-wrap"><table class="espp-sum">
    <thead><tr><th></th><th class="r">To ${monthLabel(rep.cutoff)}</th><th class="r">${rep.year} forecast</th></tr></thead>
    <tbody>
      ${r("Deducted from pay", plain(money(d.deducted)), plain(money(f.deducted)))}
      ${r("Shares held", plain(fixed(d.shares, 5)), plain(fixed(f.shares, 5)))}
      ${r("Market value", [usd(d.marketValueUsd), d.marketValueUsd], [usd(f.marketValueUsd), f.marketValueUsd], "gain")}
      ${r('Discount gain <span class="hint">shares worth \u2212 what went in</span>', plain(usd(d.untaxed)), plain(usd(f.untaxed)))}
      ${r('Dividends <span class="hint">after US tax and fee</span>', plain(usd(d.dividends)), plain(usd(f.dividends)))}
      ${r("Dividend US tax", cost(d.dividendTax, usd), cost(f.dividendTax, usd), "cost")}
      ${r('Fees <span class="hint">admin + reinvest</span>', cost(d.fees, usd), cost(f.fees, usd), "cost")}
      ${r("Withdrawal fee", cost(d.withdrawalFee, usd), cost(f.withdrawalFee, usd), "cost")}
      ${r("Tax on payslip gains", cost(d.payslipTax, money), cost(f.payslipTax, money), "cost")}
      <tr class="total"><td>Withdrawal</td><td class="r">${money(d.withdrawal)}</td><td class="r">${money(f.withdrawal)}</td></tr>
      ${r('Profit <span class="hint">after all costs</span>', [money(net(d)), net(d)], [money(net(f)), net(f)], "gain")}
    </tbody></table></div>
    <p class="hint">Red = money that never comes back. Fees and dividend tax are already inside <b>Shares held</b>, so they are not taken off again; the withdrawal fee is taken off the withdrawal, and the tax on payslip gains is taken off the profit.</p>`;
  }
  function renderEsppTab(rep, money) {
    const host = $('[data-view="espp"]');
    if (!host) return;
    const focused = document.activeElement;
    if (host.contains(focused) && focused.tagName === "INPUT") return;
    const a = getState().espp.assumptions;
    const warn = rep.ready ? "" : `<div class="callout warn">Set the <b>share price</b> and <b>USD rate</b> under Assumptions (or press the live buttons) to value the shares.</div>`;
    host.innerHTML = `${warn}${topTiles(rep, money)}
    <div class="row between" style="margin:4px 0 10px">
      <div class="seg" data-espp-year>${[rep.year - 1, rep.year, rep.year + 1].map((y) => `<button type="button" data-v="${y}" aria-pressed="${y === rep.year}" aria-label="${y === rep.year ? `${y} (shown)` : `Show ${y}`}">${y}</button>`).join("")}</div>
      <span class="hint live-line">Price ${a.price ? usd(a.price) : "\u2014"} \xB7 1 USD = ${a.fx || "\u2014"}
        <button type="button" class="btn sm ghost live" data-espp-live="both" aria-label="Refresh the share price and USD rate" title="Refresh the share price and USD rate online">${REFRESH_ICON}</button></span>
    </div>
    ${breakdown(rep, money)}
    <div class="spacer"></div>
    ${ledgerTable(rep)}`;
    reapplySpin();
  }
  async function fetchOne(kind) {
    const input = $(`[data-bind="espp.assumptions.${kind}"]`);
    try {
      const value = kind === "price" ? (await getStockPrice(getState().espp.symbol, true)).price : (await getRate("USD", activeProfile().currency, "", true)).rate;
      set(`espp.assumptions.${kind}`, String(Number(value.toFixed(4))));
      const box = $(`[data-bind="espp.assumptions.${kind}"]`);
      box?.classList.add("rate-ok");
      box?.classList.remove("rate-error");
      if (box) box.title = "Live value";
      return true;
    } catch (err) {
      input?.classList.add("rate-error");
      input?.classList.remove("rate-ok");
      if (input) input.title = `Could not fetch (${err.message}). Enter it manually.`;
      return false;
    }
  }
  async function fetchLive(kind) {
    const kinds = kind === "both" ? ["price", "fx"] : [kind];
    const arrows = kind === "both" ? "[data-espp-live]" : `[data-espp-live="${kind}"], [data-espp-live="both"]`;
    const results = await spinWhile(arrows, () => Promise.all(kinds.map(fetchOne)));
    if (results.includes(false)) toast("Live value unavailable \u2014 enter it manually");
  }
  function initEspp(onChanged) {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-espp-show]")) {
        esppAdded = true;
        onChanged();
        $("#esppBlock input")?.focus();
        return;
      }
      if (e.target.closest("[data-espp-remove]")) {
        esppAdded = false;
        set("espp.constPct", "");
        set("espp.varPct", "");
        set("espp.gain", "");
        return onChanged();
      }
      const live = e.target.closest("[data-espp-live]");
      if (live) return fetchLive(live.dataset.esppLive);
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

  // js/ui/monthPicker.js
  var SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var CHEVRON2 = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
  var open = { id: "", year: 0 };
  var handlers = /* @__PURE__ */ new Map();
  var onMonthPick = (id, fn) => handlers.set(id, fn);
  var backHandlers = /* @__PURE__ */ new Map();
  var closeHandlers = /* @__PURE__ */ new Map();
  var onMonthClose = (id, fn) => closeHandlers.set(id, fn);
  var onMonthBack = (id, fn) => backHandlers.set(id, fn);
  function openMonthPicker(id) {
    const root = document.querySelector(`.mpick[data-mpick="${id}"]`);
    if (!root) return;
    open.id = id;
    open.year = Number(root.dataset.value.slice(0, 4));
    refill(root);
    root.querySelector(".mpick-pop").hidden = false;
    root.querySelector(".mpick-btn").setAttribute("aria-expanded", "true");
  }
  function popHtml(year, value, saved) {
    const now = monthKey(/* @__PURE__ */ new Date());
    const cells = SHORT.map((name, i) => {
      const key2 = `${year}-${String(i + 1).padStart(2, "0")}`;
      const cls = ["mpick-cell", key2 === value ? "on" : "", saved.includes(key2) ? "has" : "", key2 === now ? "now" : ""].join(" ");
      return `<button type="button" class="${cls}" data-mp-pick="${key2}" aria-label="${monthLabel(key2, "long")}">${name}</button>`;
    }).join("");
    return `<div class="mpick-year">
      <button type="button" class="btn icon ghost" data-mp-year="-1" aria-label="Previous year">\u2039</button>
      <b>${year}</b>
      <button type="button" class="btn icon ghost" data-mp-year="1" aria-label="Next year">\u203A</button>
    </div><div class="mpick-grid">${cells}</div>`;
  }
  function monthPickerHtml(id, value, saved = []) {
    const shown = value || monthKey(/* @__PURE__ */ new Date());
    const isOpen = open.id === id;
    const year = isOpen ? open.year : Number(shown.slice(0, 4));
    return `<div class="mpick" data-mpick="${id}" data-value="${shown}" data-saved="${saved.join(",")}">
    <button type="button" class="mpick-btn" data-mp-toggle="${id}" aria-haspopup="true" aria-expanded="${isOpen}">
      <span>${monthLabel(shown, "long")}</span>${CHEVRON2}</button>
    <div class="mpick-pop"${isOpen ? "" : " hidden"}>${popHtml(year, shown, saved)}</div>
  </div>`;
  }
  function closeAll({ notify = true } = {}) {
    const was = open.id;
    open.id = "";
    if (notify && was) setTimeout(() => closeHandlers.get(was)?.());
    $$(".mpick-pop").forEach((p) => p.hidden = true);
    $$(".mpick-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
  function refill(root) {
    const back = backHandlers.has(root.dataset.mpick) ? '<button type="button" class="mpick-back" data-mp-back>\u2039 Back to list</button>' : "";
    root.querySelector(".mpick-pop").innerHTML = popHtml(open.year, root.dataset.value, root.dataset.saved.split(",").filter(Boolean)) + back;
  }
  function initMonthPickers() {
    document.addEventListener("click", (e) => {
      const root = e.target.closest(".mpick");
      if (!root) return closeAll();
      const id = root.dataset.mpick;
      if (e.target.closest("[data-mp-toggle]")) {
        const wasOpen = open.id === id;
        closeAll({ notify: wasOpen });
        if (wasOpen) return;
        open.id = id;
        open.year = Number(root.dataset.value.slice(0, 4));
        refill(root);
        root.querySelector(".mpick-pop").hidden = false;
        root.querySelector(".mpick-btn").setAttribute("aria-expanded", "true");
        return;
      }
      if (e.target.closest("[data-mp-back]")) {
        closeAll({ notify: false });
        return backHandlers.get(id)?.();
      }
      const step = e.target.closest("[data-mp-year]");
      if (step) {
        open.year += Number(step.dataset.mpYear);
        return refill(root);
      }
      const pick2 = e.target.closest("[data-mp-pick]");
      if (pick2) {
        closeAll({ notify: false });
        handlers.get(id)?.(pick2.dataset.mpPick);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });
  }

  // js/ui/history.js
  var drafts = /* @__PURE__ */ new Map();
  var askDelete = "";
  var movingFrom = "";
  var CHEVRON3 = '<svg class="chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
  var RED_MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14"/></svg>';
  var isSaved = (state2, month) => !!state2.months[month];
  var withProfile = (state2) => ({ ...state2, profile: activeProfile() });
  var finalPay = (state2, pay) => toNumber(pay?.amount) > 0 ? calculate({ ...withPay(withProfile(state2), pay), profile: activeProfile() }).net / 12 : 0;
  var isDirty = (month) => month === scopeMonth() ? scopeDirty() : drafts.has(month);
  function stash() {
    const month = scopeMonth();
    if (!month) return;
    if (scopeDirty()) drafts.set(month, scopePay());
    else drafts.delete(month);
  }
  function contentFor(state2, month) {
    const saved = state2.months[month];
    if (saved) return { pay: drafts.get(month) ?? saved, base: saved };
    const before = monthInForce(state2.months, month);
    const start = before ? state2.months[before] : grossPay(snapshotPay(state2), withProfile(state2));
    return { pay: drafts.get(month) ?? start, base: start };
  }
  function open2(month) {
    if (month === scopeMonth()) return;
    movingFrom = "";
    const current = scopeMonth();
    const state2 = getState();
    if (current && !isSaved(state2, current) && !isSaved(state2, month)) {
      const pay2 = scopePay();
      drafts.delete(current);
      update((s) => {
        s.ui.histMonth = month;
      });
      setScope(month, pay2, contentFor(state2, month).base);
      return;
    }
    stash();
    askDelete = "";
    const { pay, base } = contentFor(getState(), month);
    update((s) => {
      s.ui.histMonth = month;
    });
    setScope(month, pay, base);
  }
  function pickMonth(month) {
    const state2 = getState();
    const current = scopeMonth();
    if (!current || month === current) return open2(month);
    if (isSaved(state2, month)) return open2(month);
    const pay = scopePay();
    const origin = movingFrom || (isSaved(state2, current) ? current : "");
    drafts.delete(current);
    update((s) => {
      s.ui.histMonth = month;
    });
    setScope(month, pay, contentFor(state2, month).base);
    movingFrom = origin;
  }
  function nextFreeMonth(state2) {
    const now = monthKey(/* @__PURE__ */ new Date());
    if (!state2.months[now]) return now;
    const [y, m] = monthList(state2.months)[0].split("-").map(Number);
    return monthKey(new Date(y, m, 1));
  }
  function syncHistoryScope() {
    const s = getState();
    if (s.ui.inTab !== "history") {
      stash();
      if (scopeMonth()) setScope("");
      return;
    }
    const month = s.ui.histMonth && (isSaved(s, s.ui.histMonth) || drafts.has(s.ui.histMonth)) ? s.ui.histMonth : monthList(s.months)[0] ?? monthKey(/* @__PURE__ */ new Date());
    open2(month);
  }
  function placePayForm(state2) {
    const form = $("#payForm");
    const target = state2.ui.inTab === "history" && scopeMonth() ? $("#payFormSlot") : $("#payFormHome");
    if (form && target && form.parentElement !== target) target.appendChild(form);
  }
  function monthRow(state2, month, active, money) {
    const name = escapeHtml(monthLabel(month, "long"));
    if (askDelete === month) {
      return `<div class="month-row ask"><span>Delete ${name}?</span>
      <span class="row"><button class="btn sm danger" data-hist-act="delete-yes">Delete</button>
      <button class="btn sm ghost" data-hist-act="delete-no">Keep</button></span></div>`;
    }
    const pay = month === active ? scopePay() : drafts.get(month) ?? state2.months[month];
    const moved = month === active && movingFrom ? `<span class="tag">from ${escapeHtml(monthLabel(movingFrom))}</span>` : "";
    const tag = moved || (!isSaved(state2, month) ? '<span class="tag">new</span>' : isDirty(month) ? '<span class="tag">unsaved</span>' : "");
    const now = month === monthKey(/* @__PURE__ */ new Date()) ? '<span class="hint">now</span>' : "";
    return `<div class="month-row${month === active ? " on" : ""}">
    <button type="button" class="month-item" data-hist-pick="${month}"><span>${name}${now}${tag}</span>
      <span class="hint" title="Net pay">${finalPay(state2, pay) ? money(finalPay(state2, pay)) : "\u2014"}</span></button>
    <button type="button" class="btn icon ghost danger" data-hist-del="${month}" aria-label="${isSaved(state2, month) ? "Delete" : "Discard"} ${name}"
      title="${isSaved(state2, month) ? "Delete month" : "Discard"}">${RED_MINUS}</button>
  </div>`;
  }
  function savedList(state2, active, money) {
    const months = /* @__PURE__ */ new Set([...monthList(state2.months), ...drafts.keys()]);
    if (movingFrom) months.delete(movingFrom);
    if (active) months.add(active);
    const rows = [...months].sort((a, b) => b.localeCompare(a)).map((m) => monthRow(state2, m, active, money)).join("");
    return `<details class="more" data-open="histSaved">
    <summary>Saved months <span class="count">${monthList(state2.months).length || ""}</span></summary>
    <div class="inner month-list">
      <button type="button" class="month-item add" data-hist-act="new">+ New month</button>
      ${rows}
    </div>
  </details>`;
  }
  function monthSummary(state2, money, pay) {
    const r = pay.result;
    if (!r) return '<div class="hint">Enter a gross salary below to see this month\u2019s figures.</div>';
    const at = (annual) => money(fromAnnual(annual, "month", state2.schedule, pay.factor));
    return `<div class="hist-net"><span>Net pay</span><b>${at(r.net)}</b></div>
    <div class="lines compact">${breakdownLines(r, state2, at, { net: false, entered: true })}</div>`;
  }
  function renderHistory(state2, money, pay) {
    const host = $("#historyList");
    if (!host) return;
    const focused = document.activeElement;
    if (host.contains(focused) && focused.tagName === "INPUT") return;
    const month = scopeMonth();
    const saved = isSaved(state2, month);
    const dirty = !saved || scopeDirty();
    host.innerHTML = `${savedList(state2, month, money)}
    <div class="row hist-bar">
      ${monthPickerHtml("hist", month, monthList(state2.months))}
      <button type="button" class="btn sm ${dirty ? "primary" : "ghost done"}" data-hist-act="save"${dirty ? "" : ' disabled aria-disabled="true"'}>${dirty ? "Save" : "Saved"}</button>
    </div>
    <details class="hist-summary" data-open="histSummary">
      <summary><span class="section-title">Summary of ${escapeHtml(monthLabel(month, "long"))}</span>${CHEVRON3}</summary>
      ${monthSummary(state2, money, pay)}
    </details>`;
  }
  function save() {
    const month = scopeMonth();
    const pay = scopePay();
    if (!toNumber(pay?.amount)) return toast("Enter a gross salary to save this month");
    const replaced = isSaved(getState(), month);
    const gross = grossPay(pay, withProfile(getState()));
    const from = movingFrom;
    movingFrom = "";
    markScopeSaved();
    drafts.delete(month);
    update((s) => {
      s.months = moveMonth(s.months, from, month, gross);
    });
    toast(from ? `Moved ${monthLabel(from, "long")} to ${monthLabel(month, "long")}` : `${replaced ? "Updated" : "Saved"} ${monthLabel(month, "long")}`);
  }
  function showTab(tab, month = "") {
    stash();
    update((s) => {
      s.ui.inTab = tab;
      if (month) s.ui.histMonth = month;
    });
    syncHistoryScope();
  }
  function fillPay() {
    const month = scopeMonth();
    const pay = scopePay();
    if (!pay) return;
    update((s) => applyPay(s, pay));
    drafts.delete(month);
    showTab("pay");
    toast(`Pay tab filled with ${monthLabel(month, "long")}`);
  }
  function remove(month) {
    const saved = isSaved(getState(), month);
    drafts.delete(month);
    askDelete = "";
    if (saved) update((s) => {
      s.months = dropMonth(s.months, month);
    });
    toast(`${saved ? "Deleted" : "Discarded"} ${monthLabel(month, "long")}`);
    if (scopeMonth() !== month) return;
    setScope("");
    open2(monthList(getState().months)[0] ?? monthKey(/* @__PURE__ */ new Date()));
  }
  function syncHistoryBar(state2) {
    $("#fillPayBtn").hidden = state2.ui.inTab !== "history" || !scopeMonth();
  }
  function initHistory(onChanged) {
    syncHistoryScope();
    onMonthPick("hist", (month) => {
      pickMonth(month);
      onChanged();
    });
    $("#fillPayBtn").addEventListener("click", () => {
      fillPay();
      onChanged();
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-in-tabs] .tab")) {
        syncHistoryScope();
        return onChanged();
      }
      const pick2 = e.target.closest("[data-hist-pick]");
      if (pick2) {
        open2(pick2.dataset.histPick);
        return onChanged();
      }
      const del = e.target.closest("[data-hist-del]");
      if (del) {
        const month = del.dataset.histDel;
        if (isSaved(getState(), month)) askDelete = month;
        else remove(month);
        return onChanged();
      }
      const act = e.target.closest("[data-hist-act]")?.dataset.histAct;
      if (!act) return;
      if (act === "save") save();
      else if (act === "new") open2(nextFreeMonth(getState()));
      else if (act === "delete-yes") remove(askDelete);
      else if (act === "delete-no") askDelete = "";
      onChanged();
    });
  }

  // js/ui/saveMonth.js
  var CUSTOM2 = "custom";
  function initSaveMonth(onChanged, onSaved) {
    const panel = $("#saveMonthPanel");
    const select2 = $("#saveMonthSel");
    const pickHost = $("#saveMonthPickHost");
    const ask = $("#saveMonthAsk");
    let custom = "";
    let pending2 = "";
    function close() {
      panel.hidden = true;
      ask.hidden = true;
      pending2 = "";
    }
    const chosen = () => select2.hidden ? custom : select2.value;
    function drawPicker() {
      pickHost.innerHTML = monthPickerHtml("save", custom, monthList(getState().months));
      pickHost.hidden = false;
      select2.hidden = true;
    }
    function fillList(value) {
      const choices = monthChoices(getState().months, monthKey(/* @__PURE__ */ new Date()), custom);
      select2.innerHTML = [
        '<option value="" disabled>Choose a month\u2026</option>',
        ...choices.map((c) => `<option value="${c.month}">${monthLabel(c.month, "long")}${c.saved ? "" : " (not saved)"}</option>`),
        `<option value="${CUSTOM2}">Custom\u2026</option>`
      ].join("");
      select2.value = choices.some((c) => c.month === value) ? value : "";
    }
    function showList() {
      pickHost.hidden = true;
      pickHost.innerHTML = "";
      select2.hidden = false;
      fillList(custom);
      ask.hidden = true;
    }
    function commit2(month) {
      const state2 = getState();
      if (!toNumber(state2.amount)) return toast("Enter a gross salary first");
      const replaced = !!state2.months[month];
      const pay = grossPay(snapshotPay(state2), { ...state2, profile: activeProfile() });
      update((s) => {
        s.months = putMonth(s.months, month, pay);
        s.ui.histMonth = month;
      });
      if (month === custom) custom = "";
      close();
      toast(`${replaced ? "Updated" : "Saved"} ${monthLabel(month, "long")}`);
      onSaved(month);
    }
    function done() {
      const month = chosen();
      if (!month) return;
      if (!getState().months[month]) return commit2(month);
      pending2 = month;
      $("#saveMonthAskText").textContent = `${monthLabel(month, "long")} is already saved. Override it?`;
      ask.hidden = false;
    }
    function open3() {
      const now = monthKey(/* @__PURE__ */ new Date());
      const startAt = custom && !getState().months[custom] ? custom : now;
      pickHost.hidden = true;
      pickHost.innerHTML = "";
      select2.hidden = false;
      fillList(startAt);
      ask.hidden = true;
      panel.hidden = false;
    }
    $("#saveMonthBtn").addEventListener("click", () => panel.hidden ? open3() : close());
    select2.addEventListener("change", () => {
      ask.hidden = true;
      if (select2.value !== CUSTOM2) return;
      if (!custom) custom = monthKey(/* @__PURE__ */ new Date());
      drawPicker();
      openMonthPicker("save");
    });
    onMonthBack("save", showList);
    onMonthPick("save", (month) => {
      custom = month;
      showList();
    });
    onMonthClose("save", () => {
      if (!panel.hidden && select2.hidden) showList();
    });
    $("#saveMonthGo").addEventListener("click", done);
    $("#saveMonthYes").addEventListener("click", () => {
      if (pending2) commit2(pending2);
    });
    $("#saveMonthNo").addEventListener("click", () => {
      ask.hidden = true;
      pending2 = "";
    });
    $("#saveMonthCancel").addEventListener("click", close);
  }
  function syncSaveMonth(state2) {
    const onPay = state2.ui.inTab === "pay";
    $("#saveMonthBtn").hidden = !onPay;
    if (!onPay) $("#saveMonthPanel").hidden = true;
  }

  // js/ui/esppRates.js
  var pending = /* @__PURE__ */ new Set();
  var isPastConversion = (month, today) => month < monthKey(today) || month === monthKey(today) && today.getDate() > 21;
  function monthRates(state2) {
    return state2.espp.rates ?? {};
  }
  function ensureMonthRates(year, onChanged, today = /* @__PURE__ */ new Date()) {
    const state2 = getState();
    const currency = activeProfile().currency;
    const have = monthRates(state2);
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).filter((m) => isPastConversion(m, today) && !have[m] && !pending.has(`${currency}:${m}`));
    if (!months.length) return;
    months.forEach((m) => pending.add(`${currency}:${m}`));
    Promise.allSettled(months.map((m) => getConversionRate("USD", currency, m).then((rate) => [m, rate]))).then((results) => {
      const got = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (!got.length) return;
      update((s) => {
        s.espp.rates = { ...s.espp.rates ?? {} };
        got.forEach(([m, rate]) => {
          s.espp.rates[m] = String(Number(rate.toFixed(4)));
        });
      });
      onChanged();
    });
  }

  // js/ui/numberInputs.js
  var MONEY = "input[data-money]";
  function initMoneyInputs() {
    document.addEventListener("focusin", (e) => {
      if (e.target.matches?.(MONEY)) e.target.value = e.target.value.replace(/,/g, "");
    });
    document.addEventListener("focusout", (e) => {
      if (e.target.matches?.(MONEY)) e.target.value = groupDigits(e.target.value);
    });
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
  var lastForm = "";
  function render(state2) {
    const input = { ...state2, profile: activeProfile() };
    const money = createMoneyFormatter(input.profile.currency);
    const result = compute(input);
    const pay = resolvePayPeriod(state2.payPeriod);
    pay.result = computeProRata(input, result, pay.factor);
    syncTabs(state2);
    placePayForm(state2);
    syncSaveMonth(state2);
    syncHistoryBar(state2);
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
    if (scopeMonth() !== lastForm) {
      lastForm = scopeMonth();
      resetEsppAdded();
    }
    renderEsppInputs(pay.result ?? result, money, state2);
    if (state2.ui.inTab === "history") {
      renderHistory(input, money, pay);
      syncCollapsibles(state2);
    }
    if (state2.ui.resTab === "espp") {
      const draft = scopePay();
      const months = monthsWithDraft(state2.months, scopeMonth(), draft && grossPay(draft, input), scopeDirty());
      const report = esppReport({ ...input, months, esppRates: monthRates(state2) });
      renderEsppTab(report, money);
      ensureMonthRates(report.year, rebuild);
    }
  }
  function rebuild() {
    const state2 = view();
    fillSelects(state2);
    renderAllLists();
    render(state2);
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
  initHistory(rebuild);
  initSaveMonth(rebuild, (month) => {
    showTab("history", month);
    rebuild();
  });
  subscribe(render);
  rebuild();
})();
