import { $, $$ } from '../utils/dom.js';
import { stepValue } from '../utils/number.js';
import { groupDigits } from '../utils/format.js';
import * as store from '../state/store.js';

const DRAG_THRESHOLD_PX = 6;
const PX_PER_STEP = 24;

const limitOf = (input, key, fallback) => (input.dataset[key] === undefined ? fallback : Number(input.dataset[key]));

function applyStep(input, direction, multiplier = 1) {
  const step = Number(input.dataset.step) || 1;
  const delta = direction * step * multiplier;
  const next = String(stepValue(input.value, delta, limitOf(input, 'min', 0), limitOf(input, 'max', Infinity)));
  store.set(input.dataset.bind, next);
  input.value = input.hasAttribute('data-money') && document.activeElement !== input ? groupDigits(next) : next;
}

function enableDrag(input) {
  let startY = 0;
  let stepsApplied = 0;
  let dragging = false;

  input.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    startY = e.clientY;
    stepsApplied = 0;
    dragging = false;
  });

  input.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || !e.buttons) return;
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

  const stop = () => { dragging = false; };
  input.addEventListener('pointerup', stop);
  input.addEventListener('pointercancel', stop);
}

function enableWheelAndKeys(input) {
  input.addEventListener('wheel', (e) => {
    if (document.activeElement !== input) return;
    e.preventDefault();
    applyStep(input, e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    applyStep(input, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
  });
}

/** Inputs with `data-step` get wheel/keys; add `data-swipe` for touch drag; `[data-step-btn]` buttons target an input by `data-bind`. */
export function initSteppers() {
  $$('input[data-step]').forEach((input) => {
    if (input.hasAttribute('data-swipe')) enableDrag(input);
    enableWheelAndKeys(input);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step-btn]');
    const input = btn && $(`input[data-bind="${btn.dataset.target}"]`);
    if (input) applyStep(input, Number(btn.dataset.stepBtn));
  });
}
