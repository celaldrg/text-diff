/**
 * Text level diffing on top of the Myers core: tokenizing, edit scripts and
 * line change groups.
 * @module diff
 */

import { diffSequences } from './myers.js';
import { isBlankLine, tokenKeys, tokenize } from './tokens.js';

/** @typedef {import('./myers.js').Run} Run */
/** @typedef {import('./tokens.js').Mode} Mode */

/**
 * @typedef {object} TokenDiff
 * @property {string[]} aTokens
 * @property {string[]} bTokens
 * @property {Int32Array} aKeys interned comparison keys of aTokens (-1: matches nothing)
 * @property {Int32Array} bKeys interned comparison keys of bTokens
 * @property {Run[]} runs minimal edit script over the keys
 */

/**
 * @typedef {object} Edit
 * @property {'equal'|'delete'|'insert'} type
 * @property {string} text for "equal" the text as it appears in the old version
 */

/**
 * @typedef {object} ChangeGroup lines a[aStart..aEnd) were replaced by b[bStart..bEnd)
 * @property {number} aStart
 * @property {number} aEnd
 * @property {number} bStart
 * @property {number} bEnd
 * @property {boolean} ignorable every line on both sides is blank and blank lines are ignored
 */

/**
 * @typedef {object} DiffOptions
 * @property {Mode} [mode] granularity, "lines" by default
 * @property {boolean} [ignoreCase]
 * @property {boolean} [ignoreWhitespace]
 * @property {boolean} [ignoreBlankLines] lines mode: align the non-blank lines first (see {@link diffTokens})
 */

/**
 * Diffs two texts at the granularity of `options.mode` (default "lines").
 * @param {string} a old text
 * @param {string} b new text
 * @param {DiffOptions} [options]
 * @returns {TokenDiff}
 */
export function diffText(a, b, options = {}) {
  const mode = options.mode ?? 'lines';
  return diffTokens(tokenize(a, mode), tokenize(b, mode), mode, options);
}

/**
 * Diffs two token lists made by {@link tokenize}; tokens are equal when
 * their comparison keys (see {@link tokenKeys}) are equal. The script is
 * minimal, except in lines mode with `ignoreBlankLines`: there it is minimal
 * for the non-blank lines, which are aligned on their own before the blank
 * lines between them. Texts that differ only in blank lines then differ
 * only in changes made of blank lines (see {@link changeGroups}).
 * @param {string[]} aTokens
 * @param {string[]} bTokens
 * @param {Mode} mode the mode the tokens were made with
 * @param {DiffOptions} [options]
 * @returns {TokenDiff}
 */
export function diffTokens(aTokens, bTokens, mode, options = {}) {
  const { aKeys, bKeys } = internKeys(aTokens, bTokens, mode, options);
  const lines = mode === 'lines';
  const diff =
    lines && options.ignoreBlankLines
      ? (aPart, bPart) => diffNonBlankFirst(aPart, bPart, aTokens, bTokens)
      : diffSequences;
  const last = aKeys.length - 1;
  if (!lines || last < 0 || bKeys.length === 0 || aTokens[last].endsWith('\n')) {
    return { aTokens, bTokens, aKeys, bKeys, runs: diff(aKeys, bKeys) };
  }
  // The old text ends without a line break. Its last line may only match the
  // new text's last line: when whitespace is ignored it could otherwise stand
  // for a line that more lines follow, and a patch would join those lines.
  if (aKeys[last] !== bKeys[bKeys.length - 1]) {
    aKeys[last] = -1;
    return { aTokens, bTokens, aKeys, bKeys, runs: diff(aKeys, bKeys) };
  }
  const runs = diff(aKeys.subarray(0, last), bKeys.subarray(0, bKeys.length - 1));
  const tail = runs[runs.length - 1];
  if (tail?.type === 'equal') tail.count += 1;
  else runs.push({ type: 'equal', aStart: last, bStart: bKeys.length - 1, count: 1 });
  return { aTokens, bTokens, aKeys, bKeys, runs };
}

/**
 * Numbers the comparison keys (see {@link tokenKeys}) of two token lists:
 * tokens get the same number exactly when their keys are equal.
 * @param {string[]} aTokens
 * @param {string[]} bTokens
 * @param {Mode} mode the mode the tokens were made with
 * @param {{ignoreCase?: boolean, ignoreWhitespace?: boolean}} [options]
 * @returns {{aKeys: Int32Array, bKeys: Int32Array}}
 */
export function internKeys(aTokens, bTokens, mode, options) {
  const ids = new Map();
  const intern = (key) => {
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    return id;
  };
  return {
    aKeys: Int32Array.from(tokenKeys(aTokens, mode, options), intern),
    bKeys: Int32Array.from(tokenKeys(bTokens, mode, options), intern),
  };
}

/**
 * Line diff for the ignore-blank-lines option. The non-blank lines are
 * diffed on their own; every pair they match becomes an anchor, and only the
 * lines between two anchors are diffed in full. A non-blank line there has
 * no equal on the other side (the anchors are a longest common subsequence),
 * so blank lines can never pull a non-blank line out of its place.
 * @param {Int32Array} aKeys keys of the old lines
 * @param {Int32Array} bKeys keys of the new lines
 * @param {string[]} aLines the old lines (at least aKeys.length of them)
 * @param {string[]} bLines the new lines (at least bKeys.length of them)
 * @returns {Run[]}
 */
function diffNonBlankFirst(aKeys, bKeys, aLines, bLines) {
  const aIndex = nonBlankIndices(aLines, aKeys.length);
  const bIndex = nonBlankIndices(bLines, bKeys.length);
  const anchors = diffSequences(
    aIndex.map((i) => aKeys[i]),
    bIndex.map((j) => bKeys[j]),
  );
  const runs = [];
  let a = 0;
  let b = 0;
  const diffGap = (aEnd, bEnd) => {
    if (a === aEnd && b === bEnd) return;
    for (const run of diffSequences(aKeys.subarray(a, aEnd), bKeys.subarray(b, bEnd))) {
      appendRun(runs, run.type, a + run.aStart, b + run.bStart, run.count);
    }
  };
  for (const run of anchors) {
    if (run.type !== 'equal') continue;
    for (let t = 0; t < run.count; t++) {
      const i = aIndex[run.aStart + t];
      const j = bIndex[run.bStart + t];
      diffGap(i, j);
      appendRun(runs, 'equal', i, j, 1);
      a = i + 1;
      b = j + 1;
    }
  }
  diffGap(aKeys.length, bKeys.length);
  return runs;
}

/** @returns {number[]} indices of the non-blank lines among lines[0..count) */
function nonBlankIndices(lines, count) {
  const indices = [];
  for (let i = 0; i < count; i++) if (!isBlankLine(lines[i])) indices.push(i);
  return indices;
}

/**
 * Appends a run, or extends the last run when it has the same type: runs
 * arrive in order, so two neighbours of one type always continue each other.
 */
function appendRun(runs, type, aStart, bStart, count) {
  const last = runs[runs.length - 1];
  if (last?.type === type) last.count += count;
  else runs.push({ type, aStart, bStart, count });
}

/**
 * Converts runs into self-contained text edits.
 * @param {{aTokens: string[], bTokens: string[], runs?: Run[]}} diff a {@link TokenDiff}, or just its tokens
 * @param {Run[]} [runs] defaults to `diff.runs`
 * @returns {Edit[]}
 */
export function toEdits(diff, runs = diff.runs) {
  return runs.map((run) => {
    const fromB = run.type === 'insert';
    const tokens = fromB ? diff.bTokens : diff.aTokens;
    const start = fromB ? run.bStart : run.aStart;
    return { type: run.type, text: tokens.slice(start, start + run.count).join('') };
  });
}

/**
 * Applies text edits to the old text and returns the new text.
 * @param {string} source old text
 * @param {Edit[]} edits
 * @returns {string}
 * @throws {Error} when an equal or delete edit does not match the source
 */
export function applyEdits(source, edits) {
  const out = [];
  let pos = 0;
  for (const edit of edits) {
    if (edit.type === 'insert') {
      out.push(edit.text);
      continue;
    }
    if (!source.startsWith(edit.text, pos)) throw new Error(`Edit does not match the text at offset ${pos}`);
    if (edit.type === 'equal') out.push(edit.text);
    pos += edit.text.length;
  }
  if (pos !== source.length) throw new Error('Edits do not cover the whole text');
  return out.join('');
}

/**
 * @param {Run[]} runs
 * @returns {number} inserted plus deleted tokens
 */
export function editDistance(runs) {
  return runs.reduce((sum, run) => (run.type === 'equal' ? sum : sum + run.count), 0);
}

/**
 * Groups the runs of a line diff into changes (a delete and/or an insert
 * between two equal runs).
 * @param {TokenDiff} lines a diff made in "lines" mode (with `ignoreBlankLines` when that option is on)
 * @param {boolean} [ignoreBlankLines] mark groups made only of blank lines as ignorable
 * @returns {ChangeGroup[]}
 */
export function changeGroups(lines, ignoreBlankLines = false) {
  const groups = [];
  let group = null;
  for (const run of lines.runs) {
    if (run.type === 'equal') {
      group = null;
      continue;
    }
    if (!group) {
      group = { aStart: run.aStart, aEnd: run.aStart, bStart: run.bStart, bEnd: run.bStart, ignorable: false };
      groups.push(group);
    }
    if (run.type === 'delete') group.aEnd = run.aStart + run.count;
    else group.bEnd = run.bStart + run.count;
  }
  if (ignoreBlankLines) {
    for (const g of groups) {
      g.ignorable = allBlank(lines.aTokens, g.aStart, g.aEnd) && allBlank(lines.bTokens, g.bStart, g.bEnd);
    }
  }
  return groups;
}

/** @returns {boolean} true when lines[start..end) are all blank */
function allBlank(lines, start, end) {
  for (let i = start; i < end; i++) if (!isBlankLine(lines[i])) return false;
  return true;
}
