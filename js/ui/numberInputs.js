import { $$ } from '../utils/dom.js';
import { groupDigits } from '../utils/format.js';

/**
 * Money inputs show grouped digits (45,000) while not being edited. The stored value stays the plain number:
 * typing removes the commas from the field, and every reader already ignores commas.
 * A field opts in with `data-money`; rows of the editable lists use it too.
 */
const MONEY = 'input[data-money]';

export function formatMoneyInputs(root = document) {
  $$(MONEY, root).forEach((el) => {
    if (document.activeElement !== el) el.value = groupDigits(el.value);
  });
}

export function initMoneyInputs() {
  document.addEventListener('focusin', (e) => {
    if (e.target.matches?.(MONEY)) e.target.value = e.target.value.replace(/,/g, '');
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.matches?.(MONEY)) e.target.value = groupDigits(e.target.value);
  });
}
