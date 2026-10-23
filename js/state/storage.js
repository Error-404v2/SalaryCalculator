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
export function saveDebounced(data, delay = 200) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage may be blocked (private mode); the app still works for this session.
    }
  }, delay);
}
