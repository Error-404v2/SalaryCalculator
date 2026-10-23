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
  var sum = (list, pick = (x) => x) => list.reduce((acc, x) => acc + pick(x), 0);

  // js/core/periods.js
  var PERIODS = [
    { id: "year", label: "Annual", unit: "year" },
    { id: "month", label: "Monthly", unit: "month" },
    { id: "day", label: "Daily", unit: "day" },
    { id: "hour", label: "Hourly", unit: "hour" }
  ];
  var isPeriod = (id) => PERIODS.some((p) => p.id === id);
  var findPeriod = (id) => PERIODS.find((p) => p.id === id) ?? PERIODS[1];
  function periodsPerYear(periodId, schedule = {}) {
    const weeks = toNumber(schedule.weeksPerYear) || 52;
    const days = toNumber(schedule.daysPerWeek) || 5;
    const hours = toNumber(schedule.hoursPerDay) || 8;
    const table = {
      year: 1,
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
      { name: "Profit share (GDP)", amount: "", per: "year", taxable: false, insurable: false },
      { name: "Bonus", amount: "", per: "year", taxable: true, insurable: false }
    ],
    deductions: [
      { name: "Medical insurance", amount: "181.73", per: "month", pretax: false },
      { name: "Pension plan", amount: "", per: "month", pretax: true },
      { name: "Loan", amount: "", per: "month", pretax: false }
    ]
  };
  var BLANK_ROWS = {
    incomes: { name: "", amount: "", per: "month", taxable: true, insurable: false },
    cashAwards: { name: "Cash Award", amount: "", currency: "USD", rate: "", per: "year", taxable: true },
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
    const totalDeductions = si.employee + incomeTax + leviesTotal + preTax + postTax;
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
    ui: {
      resTab: "summary",
      period: "month",
      theme: "",
      taxEdit: false,
      open: { overtime: false, extras: false, deductions: false, options: false, settings: false, brackets: false, exemption: false, levies: false, si: false, jobs: false }
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
    [...state2.incomes, ...state2.deductions, ...state2.cashAwards].forEach((item) => {
      if (!isPeriod(item.per)) item.per = "month";
    });
    sortOvertime(state2.overtime);
    return state2;
  }
  var hydrate = (saved) => sanitize(mergeShape(DEFAULT_STATE, upgradeV1(saved)));

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
  function initTabs() {
    $("[data-tabs]").addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (tab) set("ui.resTab", tab.dataset.tab);
    });
  }
  function syncTabs(state2) {
    const active = state2.ui.resTab;
    $$("[data-tabs] .tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === active)));
    $$("[data-panel]").forEach((p) => p.hidden = p.dataset.panel !== active);
  }

  // js/ui/form.js
  var periodOptions = (selected) => PERIODS.map((p) => `<option value="${p.id}"${p.id === selected ? " selected" : ""}>${p.label}</option>`).join("");
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

  // js/services/exchangeRates.js
  var SOURCES = [
    {
      name: "open.er-api.com",
      url: (from) => `https://open.er-api.com/v6/latest/${from}`,
      read: (data, from, to) => data.result === "success" ? data.rates?.[to] : void 0
    },
    {
      name: "currency-api (jsDelivr)",
      url: (from) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.json`,
      read: (data, from, to) => data[from.toLowerCase()]?.[to.toLowerCase()]
    }
  ];
  var TIMEOUT_MS = 8e3;
  var CACHE_MS = 60 * 60 * 1e3;
  var cache = /* @__PURE__ */ new Map();
  async function fetchJson(url) {
    const controller = new AbortController();
    const timer2 = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer2);
    }
  }
  async function getRate(from, to) {
    const key2 = `${from}>${to}`;
    const hit = cache.get(key2);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const errors = [];
    for (const source of SOURCES) {
      try {
        const rate = Number(source.read(await fetchJson(source.url(from)), from, to));
        if (Number.isFinite(rate) && rate > 0) {
          const value = { rate, source: source.name };
          cache.set(key2, { at: Date.now(), value });
          return value;
        }
        errors.push(`${source.name}: no ${to} rate`);
      } catch (err) {
        errors.push(`${source.name}: ${err.name === "AbortError" ? "timed out" : err.message}`);
      }
    }
    throw new Error(errors.join("; "));
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
    ${select("incomes", i, "per", periodOptions(it.per))}${removeBtn("incomes", i)}
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
      ${advanced("cashAwards", i, `${select("cashAwards", i, "per", periodOptions(it.per), "xs-select")}${check("cashAwards", i, "taxable", it.taxable, "Taxable")}`)}
      ${net}</div>`;
    },
    deductions: (it, i) => `<div class="item income">
    ${text("deductions", i, "name", it.name, "Name")}${num("deductions", i, "amount", it.amount, "Amount")}
    ${select("deductions", i, "per", periodOptions(it.per))}${removeBtn("deductions", i)}
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
    $$("details[data-open]").forEach((el) => {
      el.addEventListener("toggle", () => {
        const path = `ui.open.${el.dataset.open}`;
        if (get(path) !== el.open) set(path, el.open);
      });
    });
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
      { color: COLORS.other, value: r.preTax + r.postTax, label: "Other deductions" }
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
      ["Other", r.preTax + r.postTax],
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
      <td class="r">${money(b.portion)}</td><td class="r">${money(b.tax)}</td><td class="r">${money(b.tax / 12)}</td>
    </tr>`).join("");
    const excluded = r.bracketRows.filter((b) => b.excluded);
    const note = excluded.length ? `<p class="hint">Taxable income exceeds ${money(excluded.at(-1).exclusion)}, so the
        ${excluded.map((b) => `${b.rate}%`).join(", ")} bracket${excluded.length > 1 ? "s are" : " is"} excluded.</p>` : "";
    return `<div class="section-title">Brackets</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Rate</th><th>Range (annual)</th><th>Status</th><th class="r">Taxed amount</th><th class="r">Tax / year</th><th class="r">Tax / month</th></tr></thead>
      <tbody>${rows}<tr class="total"><td colspan="4">Income tax</td><td class="r">${money(r.incomeTax)}</td><td class="r">${money(r.incomeTax / 12)}</td></tr></tbody>
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
      { color: COLORS.other, value: r.preTax + r.postTax, label: "Other deductions" }
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
  var VIEWS = {
    summary: renderSummary,
    periods: renderPeriods,
    tax: renderTaxDetail,
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
      if (host.dataset.view !== active) return;
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
  subscribe(render);
  rebuild();
})();
