/**
 * The only place that touches localStorage. Every access is wrapped in
 * try/catch, so private browsing, blocked storage or a full quota never
 * break the app: reads fall back to a default and writes report false.
 * Values are stored as JSON under a "text-diff:" prefix.
 * @module storage
 */

const PREFIX = 'text-diff:';

/**
 * @returns {Storage|null} the browser's localStorage, or null when it is missing or blocked
 */
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads a stored value.
 * @template T
 * @param {string} key
 * @param {T} fallback returned when nothing (readable) is stored
 * @param {Storage|null} [backend] defaults to localStorage
 * @returns {T}
 */
export function load(key, fallback, backend = browserStorage()) {
  try {
    const raw = backend?.getItem(PREFIX + key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Stores a value.
 * @param {string} key
 * @param {unknown} value anything JSON can represent
 * @param {Storage|null} [backend] defaults to localStorage
 * @returns {boolean} true when the value was written
 */
export function save(key, value, backend = browserStorage()) {
  if (!backend) return false;
  try {
    backend.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
