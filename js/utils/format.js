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
