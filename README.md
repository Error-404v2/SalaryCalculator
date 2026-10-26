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
   - Period choices depend on the item: Transportation is *Monthly* or *Annual*; Profit share, Bonus, added allowances and cash awards are *One-Time*, *Bi-annual* or *Quarterly*. **One-Time** counts in full in the month it's paid instead of being spread over the year.
   - **Live rate ⟳** fetches today's rate with no setup or API key. It tries open.er-api.com first, then the currency-api on jsDelivr, and caches the result for an hour. The rate box turns **green** on success, or **red** if no source could be reached (enter the rate manually then; typing a rate clears the colour).
3. **Other deductions:** taken before tax or after tax. Medical insurance (default 230.8) is *Monthly* or *Annual*; other deductions can't be daily or hourly.
   - **Stocks:** add it with *+ Stocks* (before Loan) or *+ Add Stocks*. It becomes the first deduction: *Constant %* (of basic) and *Variable %* (of whatever is ticked under More options → Settings → *Stocks: what counts as variable*), side by side, then a banner with the monthly amounts. It comes out of net pay after tax and is on whenever a % is above 0.
4. **More options:** **job type** first, then social insurance base override, manual taxable amount, and compact **Settings** (weeks/year, days/week, hours/day, OT base hours/month, export/import/reset).

Rarely changed per-row options sit under a muted **Advanced ⌄** toggle on the right of a single line, with a faded preview of the first options on its left. Clicking it expands the options: the *taxable* / *counts toward SI base* flags, a cash award's period and taxable flag, and a deduction's before-tax flag.

**Save Month** (Pay tab bar, right): stores a full copy of the Pay tab under a month, always as a **gross** salary (a Net → Gross Pay tab is solved first). One line: *Done*, *Cancel*, then a dropdown of saved months (nearest first) and *Custom…*, which turns into a calendar. The last calendar pick stays in the dropdown as "(not saved)". Saving over an existing month asks first, inline; after saving, the History tab opens on that month.

**History tab** (input card), with *Fill Pay* in the tab bar to copy the open month into the Pay tab:
- **Saved months:** collapsible, *+ New month* first, then one line per month with its final (net) pay in grey and a red − to delete it (asks inline).
- **Month and Save:** a calendar on the left and *Save* on the right (greyed out as *Saved* when nothing changed). Picking another month moves the open entry there; Save stores it under the picked month.
- **Summary of (month):** collapsible; net pay, then the pay items and deductions as compact lines, with the values you entered softly highlighted.
- **The Pay form:** the same collapsibles and items as the Pay tab, editing that month. Gross → Net, tax year and Pro-rata stay on the Pay tab.

**Results tabs**

- **Summary:** annual / monthly / daily / hourly view. Earnings are shown in green and deductions in red. One tile shows the average income tax with the max bracket under it.
- **Tax:** pick a **tax profile**, then *Edit*, *+ New* (copies the current one) or *Delete* (shown only when there's more than one profile). A profile holds:
  - currency (from the list, or *Custom…* for any code)
  - brackets (rate / from / to / excluded above)
  - exemption
  - levies (% of gross or of taxable income)
  - social insurance rates and yearly caps
  - job types

  Each part of the editor is collapsible. This means any progressive tax system can be modelled. Below the editor, it shows how taxable income is reached and the status of each bracket, and ends with the **By period** table (annual, monthly, daily, hourly).
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
    history.js       month keys and labels, old per-field history
    months.js        saved months (full Pay copies), gross conversion, moves
  data/              Egypt 2026 profile, presets, currencies
  state/             store ("@." paths = active profile), migration, localStorage
  ui/                tabs, form bindings, collapsibles, row templates, lists,
                     tax profiles, settings, swipe stepper, advanced toggles
    results/         one renderer per results tab
  services/          http.js (timeouts, fallbacks, cache), exchangeRates.js (live + dated FX)
  utils/             number, format, dom, object helpers
tests/               node:test unit tests for core/
```

The default rules follow the Egypt 2026 tax law.
