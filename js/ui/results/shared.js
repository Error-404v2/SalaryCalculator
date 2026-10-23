import { formatPercent } from '../../utils/format.js';

export const COLORS = {
  net: 'var(--c-net)',
  tax: 'var(--c-tax)',
  si: 'var(--c-si)',
  employer: 'var(--c-emp)',
  other: 'var(--c-other)',
};

export const line = (label, value, cls = '', color = '') =>
  `<div class="line ${cls}"><span class="k">${color ? `<i class="sw" style="background:${color}"></i>` : ''}${label}</span><span class="v">${value}</span></div>`;

export const negative = (value) => `<span class="neg">− ${value}</span>`;
export const positive = (value) => `<span class="pos">${value}</span>`;

export const stat = (label, value, tone = '') => `<div class="stat"><div class="k">${label}</div><div class="v ${tone}">${value}</div></div>`;

/** segments: [{ color, value, label }] */
export function legend(segments) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return `<div class="legend">${segments
    .filter((s) => s.value > 0)
    .map((s) => `<span><i class="sw" style="background:${s.color}"></i>${s.label} ${formatPercent(s.value / total)}</span>`)
    .join('')}</div>`;
}

export function donut(segments, centerValue, centerLabel) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let angle = 0;
  const stops = segments.map((s) => {
    const start = angle;
    angle += (s.value / total) * 360;
    return `${s.color} ${start}deg ${angle}deg`;
  });
  return `<div class="donut-box">
    <div class="donut" style="background:conic-gradient(${stops.join(',')})"><div class="c"><b>${centerValue}</b><span>${centerLabel}</span></div></div>
    ${legend(segments)}</div>`;
}

export function stackedBar(segments) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return `<div class="flow">${segments
    .filter((s) => s.value > 0)
    .map((s) => `<div style="flex:${s.value / total};background:${s.color}" title="${s.label}"></div>`)
    .join('')}</div>${legend(segments)}`;
}
