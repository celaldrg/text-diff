/**
 * Tokenizers and comparison keys for the three diff granularities.
 * Every tokenizer is lossless: `tokenize(text, mode).join('') === text`.
 * @module tokens
 */

/** @typedef {'lines'|'words'|'chars'} Mode */

/** The diff granularities, in the order a UI should offer them. */
export const MODES = Object.freeze(['lines', 'words', 'chars']);

/** Lines keep their terminator; a last line without one is still a line. */
const LINE_RE = /[^\n]*\n|[^\n]+/g;
/** Line break | word | run of horizontal space | any other character (with its marks). */
const WORD_RE = /\r?\n|[\p{L}\p{M}\p{N}_]+|[^\S\r\n]+|\P{M}\p{M}*/gu;
/** Line break | run of horizontal space | one character with its marks | stray marks. */
const CHAR_RE = /\r?\n|[^\S\r\n]+|\P{M}\p{M}*|\p{M}+/gu;

const SPACE_RE = /^[^\S\r\n]/;
const WORD_START_RE = /^[\p{L}\p{M}\p{N}_]/u;

/**
 * Splits text into lines, each keeping its "\n" (or "\r\n") terminator.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  return text.match(LINE_RE) ?? [];
}

/**
 * Splits text into tokens for the given mode.
 * Words mode yields words, single punctuation characters, runs of spaces and
 * line breaks; chars mode yields characters, runs of spaces and line breaks.
 * @param {string} text
 * @param {Mode} mode
 * @returns {string[]}
 */
export function tokenize(text, mode) {
  if (mode === 'lines') return splitLines(text);
  return text.match(mode === 'words' ? WORD_RE : CHAR_RE) ?? [];
}

/**
 * Builds the function that maps a token to its comparison key.
 * - ignoreWhitespace: lines compare with runs of whitespace collapsed and the
 *   ends trimmed; word/char tokens treat every run of spaces as equal.
 * - ignoreCase: keys are case folded (see {@link foldCase}).
 * @param {Mode} mode
 * @param {{ignoreCase?: boolean, ignoreWhitespace?: boolean}} [options]
 * @returns {(token: string) => string}
 */
export function keyFunction(mode, { ignoreCase = false, ignoreWhitespace = false } = {}) {
  const fold = ignoreCase ? foldCase : (text) => text;
  if (mode === 'lines') {
    return ignoreWhitespace ? (line) => fold(line.replace(/\s+/g, ' ').trim()) : fold;
  }
  if (!ignoreWhitespace) return fold;
  return (token) => {
    if (isSpace(token)) return ' ';
    return isLineBreak(token) ? '\n' : fold(token);
  };
}

/**
 * Builds the comparison keys of a token list. In words mode a run of spaces
 * also carries the key of the token after it, so spaces only match spaces
 * that stand before the same word; otherwise the many spaces of a text
 * would tie unrelated words together.
 * @param {string[]} tokens
 * @param {Mode} mode
 * @param {{ignoreCase?: boolean, ignoreWhitespace?: boolean}} [options]
 * @returns {string[]}
 */
export function tokenKeys(tokens, mode, options) {
  const keys = tokens.map(keyFunction(mode, options));
  if (mode === 'words') {
    for (let i = keys.length - 2; i >= 0; i--) if (isSpace(tokens[i])) keys[i] += keys[i + 1];
  }
  return keys;
}

/**
 * Case folding that also treats the Turkish dotted and dotless i as "i",
 * so "İSTANBUL", "Istanbul" and "ıstanbul" all compare equal.
 * @param {string} text
 * @returns {string}
 */
export function foldCase(text) {
  return text.toLowerCase().replace(/̇/g, '').replace(/ı/g, 'i');
}

/**
 * @param {string} token
 * @returns {boolean} true for "\n" and "\r\n"
 */
export function isLineBreak(token) {
  return token === '\n' || token === '\r\n';
}

/**
 * @param {string} token
 * @returns {boolean} true for a run of horizontal whitespace
 */
export function isSpace(token) {
  return SPACE_RE.test(token);
}

/**
 * @param {string} token
 * @returns {boolean} true when the token starts with a letter, digit or "_"
 */
export function isWordToken(token) {
  return WORD_START_RE.test(token);
}

/**
 * @param {string} line
 * @returns {boolean} true when the line holds nothing but whitespace
 */
export function isBlankLine(line) {
  return line.trim() === '';
}
