const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const formatNumber = (v) => whole.format(v);

export function createMoneyFormatter(currency) {
  const label = escapeHtml(currency);
  return (value, withCents = false) => {
    const useCents = withCents || (value !== 0 && Math.abs(value) < 100);
    return `${label} ${(useCents ? cents : whole).format(value)}`;
  };
}

export const formatPercent = (ratio) => `${(ratio * 100).toFixed(1)}%`;

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** "45000" → "45,000" for display in an input; anything that isn't a plain number is left as typed. */
export function groupDigits(value) {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  return /^-?\d+(\.\d+)?$/.test(raw) ? grouped.format(Number(raw)) : String(value ?? '');
}
