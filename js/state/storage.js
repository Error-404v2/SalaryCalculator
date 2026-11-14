const STORAGE_KEY = 'salary-calc-v1';

export function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let timer;
/** `data` may be a function, read when the save actually happens, so it is never stale. */
export function saveDebounced(data, delay = 200) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(typeof data === 'function' ? data() : data));
    } catch {
      // Storage may be blocked (private mode); the app still works for this session.
    }
  }, delay);
}
