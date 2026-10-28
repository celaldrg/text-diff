/**
 * A comparison session: the state a UI drives. It holds the two texts and
 * the options, computes the comparison lazily (once per change) and keeps
 * the position of the change the user has jumped to.
 * @module session
 */

import { compare, normalizeOptions } from './compare.js';
import { applyPatch } from './unified.js';

/** @typedef {import('./compare.js').Options} Options */
/** @typedef {import('./compare.js').Comparison} Comparison */
/** @typedef {import('./unified.js').ApplyResult} ApplyResult */

/**
 * @typedef {object} SessionState
 * @property {string} left old text
 * @property {string} right new text
 * @property {Options} options
 * @property {Comparison} result
 * @property {number} current index into result.changes of the selected change, -1 for none
 */

/**
 * @typedef {object} Session
 * @property {() => SessionState} getState
 * @property {(text: string) => void} setLeft
 * @property {(text: string) => void} setRight
 * @property {() => void} swap exchanges the two texts
 * @property {() => void} clear empties both texts
 * @property {(options: Partial<Options>) => Options} setOptions merges and returns the options
 * @property {() => number} nextChange selects the next change (wrapping) and returns its index, -1 if none
 * @property {() => number} prevChange selects the previous change (wrapping) and returns its index, -1 if none
 * @property {(index: number) => number} selectChange selects change `index` and returns it; an index out of range changes nothing and returns -1
 * @property {(patch: string) => ApplyResult} applyPatch applies a unified diff to the left text; on success the result becomes the right text
 */

/**
 * Creates a session.
 * @param {{left?: string, right?: string, options?: Partial<Options>}} [init]
 * @returns {Session}
 */
export function createSession({ left = '', right = '', options } = {}) {
  let texts = { left: String(left), right: String(right) };
  let opts = normalizeOptions(options);
  /** @type {Comparison|null} */
  let result = null;
  let current = -1;

  const invalidate = () => {
    result = null;
    current = -1;
  };
  const comparison = () => {
    result ??= compare(texts.left, texts.right, opts);
    return result;
  };
  const step = (direction) => {
    const count = comparison().changes.length;
    if (count === 0) return (current = -1);
    if (current < 0) current = direction > 0 ? 0 : count - 1;
    else current = (current + direction + count) % count;
    return current;
  };

  return {
    getState: () => ({ left: texts.left, right: texts.right, options: opts, result: comparison(), current }),
    setLeft(text) {
      texts = { ...texts, left: String(text) };
      invalidate();
    },
    setRight(text) {
      texts = { ...texts, right: String(text) };
      invalidate();
    },
    swap() {
      texts = { left: texts.right, right: texts.left };
      invalidate();
    },
    clear() {
      texts = { left: '', right: '' };
      invalidate();
    },
    setOptions(partial) {
      opts = normalizeOptions({ ...opts, ...partial });
      invalidate();
      return opts;
    },
    nextChange: () => step(1),
    prevChange: () => step(-1),
    selectChange(index) {
      if (!Number.isInteger(index) || index < 0 || index >= comparison().changes.length) return -1;
      current = index;
      return current;
    },
    applyPatch(patch) {
      const applied = applyPatch(texts.left, patch);
      if (applied.ok) {
        texts = { ...texts, right: applied.text };
        invalidate();
      }
      return applied;
    },
  };
}
