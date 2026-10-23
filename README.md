# SalaryCalculator

Client-side Egypt salary and income tax calculator. There's no backend: everything runs in the browser and is saved to `localStorage`.

## Live site

Hosted free on GitHub Pages from the `main` branch root: `https://<your-username>.github.io/SalaryCalculator/`

## Run

Just open `index.html` in a browser by double-clicking it. You don't need a server or a backend.

The source in `js/` and `css/` is split into modules, and `dist/` holds the bundled `app.js` and `app.css` that the page loads. After you edit the source, rebuild:

```bash
npm install        # once
npm run build      # rebuild dist/app.js + dist/app.css
npm run watch      # rebuild the JS automatically while editing
npm test           # engine unit tests (Node 18+)
```

## Features

**Salary card**

The salary amount is the only required field.

- **First line:** Gross → Net or Net → Gross, with the tax year beside it.
- **Pro-rata:** *Month* (default 1) and *Day* (default 0) spinners with ▲▼ buttons. As in the original sheet, the period is `months + days / 30` of a full month (for example 0 months + 15 days = half a month, 1 month − 10 days = ⅔).
  - These scale with the period: basic salary, allowances, the tax brackets and the exemption.
  - These stay as entered: actual overtime hours and cash awards.
- **Salary amount and period:** swipe or scroll on the field, or press ↑ / ↓, to change it in steps of 100.

Collapsible sections, in this order:

1. **Overtime:** shows the base (×1) hourly rate, gross and net. Choose a type (Holiday ×2, Rest day ×1.7, Weekday ×1.35, Regular ×1, Night ×0.09) or *Custom…*, which unlocks the multiplier. Entries are always sorted. Each one shows its gross and its **real net effect**.
2. **Allowances & bonuses:** starts with *Transportation 1,000 / month*. Quick-add: Transportation, Profit share (GDP), Bonus. Holds regular allowances (each with its own period and *taxable* / *counts toward SI base* flags) and **cash awards** (amount, currency, exchange rate, period, and net effect).
   - **Live rate ⟳** fetches today's rate with no setup or API key. It tries open.er-api.com first, then the currency-api on jsDelivr, and caches the result for an hour. The rate box turns **green** on success, or **red** if no source could be reached (enter the rate manually then; typing a rate clears the colour).
3. **Other deductions:** taken before tax or after tax.
4. **More options:** social insurance base override, manual taxable amount, **job type**, and compact **Settings** (weeks/year, days/week, hours/day, OT base hours/month, export/import/reset).

Rarely changed per-row options sit under a muted **Advanced ⌄** toggle on the right of a single line, with a faded preview of the first options on its left. Clicking it expands the options: the *taxable* / *counts toward SI base* flags, a cash award's period and taxable flag, and a deduction's before-tax flag.

5. **ESPP:** an *On* switch, a tile with this month's constant, variable and total deduction, and the two percentages. *Constant %* applies to basic salary; *Variable %* applies to whatever is ticked under More options → Settings → *ESPP: what counts as variable*. ESPP comes out of net pay after tax.

**History tab** (input card): dated values for gross salary, transportation, medical insurance and the two ESPP percentages. Each value applies from its month until the next one. *Save current* stores today's Pay-tab value; *Fill Pay tab* loads the values in force for any chosen month. The ESPP ledger uses the value in force for each month.

**Results tabs**

- **Summary:** annual / monthly / daily / hourly view. Earnings are shown in green and deductions in red. One tile shows the average income tax with the max bracket under it.
- **Tax:** pick a **tax profile**, then *Edit*, *+ New* (copies the current one) or *Delete* (shown only when there's more than one profile). A profile holds:
  - currency (from the list, or *Custom…* for any code)
  - brackets (rate / from / to / excluded above)
  - exemption
  - levies (% of gross or of taxable income)
  - social insurance rates and yearly caps
  - job types

  Each part of the editor is collapsible. This means any progressive tax system can be modelled. Below the editor, it shows how taxable income is reached and the status of each bracket.
- **By period:** a table of every period.
- **ESPP:** top tiles for *Withdrawal*, *Profit* and *Shares*, each shown up to the adjusted month and as a full-year forecast, then a to-date vs. forecast breakdown and the month-by-month ledger.
  - **Yellow columns** (Deducted, Deducted USD, Dividend, ACC. Shares): blank means forecast; type the actual value to lock it.
  - Forecast rules: USD at the set rate, shares bought at price × (1 − discount), quarterly dividends (Mar/Jun/Sep/Dec) on shares held two months earlier, reinvest fee capped, an entry fee each Jan and Jul.
  - **Withdrawal** = (shares × price − withdrawal fee − tax still due) × USD rate, where tax still due = tax % × un-taxed gains − tax already paid through payroll (*Payroll tax events*).
  - **Adjusted month:** before the *change day*, the current month isn't settled yet, so totals run to the previous month (plus an optional offset).
  - **Live data, no setup:** share price from Alpha Vantage's public demo key (covers IBM), USD rate from the free currency API. Green when fetched, red when unavailable, in which case type it.
- **Employer cost:** the real tax rate, including employer social insurance.

### How the net effect of overtime and cash awards is calculated

`net(with all overtime) − net(without overtime)`, keeping the basic salary the same. This captures the extra income tax from moving into higher brackets, the levies, and any change in social insurance. Because tax is progressive, the group total is split across the entries in proportion to their gross amount, so the entries always add up to the total.

## Structure

```
index.html
css/                 main.css imports the modules below
  tokens.css         colors (light/dark), radii
  base.css layout.css tabs.css forms.css lists.css tables.css results.css
js/
  main.js            entry: wires modules, compute → render
  core/              pure calculation logic (no DOM)
    periods.js       period ↔ annual conversion
    incomeTax.js     progressive brackets + exclusion rule, validation
    socialInsurance.js
    overtime.js      OT types, labels, ordering
    calculator.js    full breakdown for one profile
    solver.js        net → gross bisection
    impacts.js       net effect of overtime and cash awards
    proRata.js       month/day pro-rata input adjustment
    history.js       dated values (value in force for a month)
    espp.js          ESPP ledger, summary, payroll tax, adjusted month
    esppForecast.js  ESPP report from state + history
  data/              Egypt 2026 profile, presets, currencies
  state/             store ("@." paths = active profile), migration, localStorage
  ui/                tabs, form bindings, collapsibles, row templates, lists,
                     tax profiles, settings, swipe stepper, advanced toggles
    results/         one renderer per results tab
  services/          http.js (timeouts, fallbacks, cache), exchangeRates.js (live + dated FX),
                     stockPrice.js (key-less share price)
  utils/             number, format, dom, object helpers
tests/               node:test unit tests for core/
```

The default rules come from `salary - public V1.xlsx`.
