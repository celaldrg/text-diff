/**
 * The comparison engine behind the UI. Lines are always aligned with a line
 * diff, and inside each changed block similar old and new lines are paired
 * side by side. The chosen granularity decides the highlights: "lines"
 * highlights the words that differ inside each pair, "words" and "chars"
 * diff the whole block word by word or character by character.
 * @module compare
 */

import { alignLines } from './align.js';
import { cleanupSemantic } from './cleanup.js';
import { changeGroups, diffText, internKeys, toEdits } from './diff.js';
import { diffWithBudget } from './myers.js';
import { formatUnified } from './unified.js';
import { MODES, isLineBreak, isSpace, tokenize } from './tokens.js';

/** @typedef {import('./tokens.js').Mode} Mode */
/** @typedef {import('./diff.js').TokenDiff} TokenDiff */
/** @typedef {import('./diff.js').ChangeGroup} ChangeGroup */
/** @typedef {import('./diff.js').Edit} Edit */

/**
 * @typedef {object} Options
 * @property {Mode} mode
 * @property {boolean} ignoreWhitespace
 * @property {boolean} ignoreCase
 * @property {boolean} ignoreBlankLines
 * @property {number} context lines of context around each unified hunk
 */

/**
 * A piece of one line. A line break is always a part of its own ("\n" or
 * "\r\n"), so a UI can hide unchanged breaks and mark changed ones.
 * @typedef {{text: string, changed: boolean}} Part
 */

/** @typedef {{num: number, parts: Part[]}} Side one numbered line */

/**
 * One side-by-side row. "change" pairs an old and a new line, "delete" and
 * "insert" have one side only, "ignored" holds blank lines skipped by the
 * ignore-blank-lines option.
 * @typedef {{kind: 'equal'|'change'|'delete'|'insert'|'ignored', left: Side|null, right: Side|null}} Row
 */

/**
 * One row of the inline (unified style) view.
 * @typedef {{kind: 'equal'|'delete'|'insert'|'ignored', aNum: number|null, bNum: number|null, parts: Part[]}} InlineRow
 */

/**
 * @typedef {object} Stats
 * @property {number} added rows that exist only in the new text
 * @property {number} removed rows that exist only in the old text
 * @property {number} changed rows that pair an old and a new line
 * @property {number} similarity 0..100, share of the characters that match
 */

/**
 * @typedef {object} Comparison
 * @property {Options} options
 * @property {Row[]} rows side-by-side rows
 * @property {InlineRow[]} inline inline rows
 * @property {{row: number, inline: number}[]} changes first row of every change, for navigation
 * @property {Stats} stats
 * @property {number} coarse word or character diffs (of a changed block, or of a line pair in
 *   lines mode) that ran out of search budget, so part of their text is marked as replaced
 *   as a whole instead of word by word or character by character
 * @property {Edit[]} script edit script at the chosen granularity
 * @property {string} unified the changes as a unified diff ("" when there are none)
 */

/** Default options, also used for anything missing or invalid. */
export const DEFAULT_OPTIONS = Object.freeze({
  mode: 'lines',
  ignoreWhitespace: false,
  ignoreCase: false,
  ignoreBlankLines: false,
  context: 3,
});

/**
 * Search steps (see diffWithBudget) that the word and character diffs of one
 * comparison share in proportion to their length, so that even two long
 * unrelated texts compare in a fraction of a second.
 */
const FINE_STEPS = 1e7;
/** Steps that every word or character diff may take, whatever its share. */
const MIN_FINE_STEPS = 5e4;

/**
 * Fills in defaults and drops invalid values.
 * @param {Partial<Options>} [options]
 * @returns {Options}
 */
export function normalizeOptions(options = {}) {
  const raw = options.context;
  const context = typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : raw;
  return {
    mode: MODES.includes(options.mode) ? options.mode : DEFAULT_OPTIONS.mode,
    ignoreWhitespace: Boolean(options.ignoreWhitespace),
    ignoreCase: Boolean(options.ignoreCase),
    ignoreBlankLines: Boolean(options.ignoreBlankLines),
    context: Number.isInteger(context) && context >= 0 ? context : DEFAULT_OPTIONS.context,
  };
}

/**
 * Compares two texts and builds everything a UI shows.
 * @param {string} left old text
 * @param {string} right new text
 * @param {Partial<Options>} [options]
 * @returns {Comparison}
 */
export function compare(left, right, options) {
  const opts = normalizeOptions(options);
  const lines = diffText(left, right, { ...opts, mode: 'lines' });
  const groups = changeGroups(lines, opts.ignoreBlankLines);
  const view = {
    rows: [],
    inline: [],
    changes: [],
    script: [],
    matched: 0,
    coarse: 0,
    changedLength: changedLength(lines, groups),
  };
  let a = 0;
  let b = 0;
  for (const group of groups) {
    addEqualLines(view, lines, a, b, group.aStart - a);
    if (group.ignorable) addIgnoredGroup(view, lines, group);
    else addChangedGroup(view, lines, group, opts);
    a = group.aEnd;
    b = group.bEnd;
  }
  addEqualLines(view, lines, a, b, lines.aTokens.length - a);
  return {
    options: opts,
    rows: view.rows,
    inline: view.inline,
    changes: view.changes,
    stats: computeStats(view, left.length + right.length),
    coarse: view.coarse,
    script: view.script,
    unified: formatUnified(lines, groups, opts),
  };
}

/**
 * @param {TokenDiff} lines
 * @param {ChangeGroup[]} groups
 * @returns {number} length of the changed lines on both sides, ignored changes left out
 */
function changedLength(lines, groups) {
  let length = 0;
  for (const group of groups) {
    if (group.ignorable) continue;
    length += textLength(lines.aTokens, group.aStart, group.aEnd - group.aStart);
    length += textLength(lines.bTokens, group.bStart, group.bEnd - group.bStart);
  }
  return length;
}

/** Adds `count` unchanged lines starting at a[a] and b[b]. */
function addEqualLines(view, lines, a, b, count) {
  for (let t = 0; t < count; t++) {
    const aLine = lines.aTokens[a + t];
    const bLine = lines.bTokens[b + t];
    const parts = lineParts(aLine, false);
    view.rows.push({
      kind: 'equal',
      left: { num: a + t + 1, parts },
      right: { num: b + t + 1, parts: lineParts(bLine, false) },
    });
    view.inline.push({ kind: 'equal', aNum: a + t + 1, bNum: b + t + 1, parts });
    pushEdit(view.script, 'equal', aLine);
    view.matched += aLine.length + bLine.length;
  }
}

/** Adds a group of blank lines that the ignore-blank-lines option hides. */
function addIgnoredGroup(view, lines, group) {
  const aLines = lines.aTokens.slice(group.aStart, group.aEnd);
  const bLines = lines.bTokens.slice(group.bStart, group.bEnd);
  for (let t = 0; t < Math.max(aLines.length, bLines.length); t++) {
    const left = t < aLines.length ? { num: group.aStart + t + 1, parts: lineParts(aLines[t], false) } : null;
    const right = t < bLines.length ? { num: group.bStart + t + 1, parts: lineParts(bLines[t], false) } : null;
    view.rows.push({ kind: 'ignored', left, right });
    view.inline.push({ kind: 'ignored', aNum: left?.num ?? null, bNum: right?.num ?? null, parts: (left ?? right).parts });
  }
  const aText = aLines.join('');
  const bText = bLines.join('');
  pushEdit(view.script, 'delete', aText);
  pushEdit(view.script, 'insert', bText);
  view.matched += aText.length + bText.length;
}

/**
 * Adds a real change. Side by side, paired lines share a "change" row and
 * the others get a "delete" or "insert" row; inline, the old lines come
 * before the new ones.
 */
function addChangedGroup(view, lines, group, opts) {
  view.changes.push({ row: view.rows.length, inline: view.inline.length });
  const aLines = lines.aTokens.slice(group.aStart, group.aEnd);
  const bLines = lines.bTokens.slice(group.bStart, group.bEnd);
  const pairs = alignLines(aLines, bLines, opts);
  const { aParts, bParts } =
    opts.mode === 'lines'
      ? highlightPairs(view, aLines, bLines, pairs, opts)
      : highlightBlock(view, aLines, bLines, opts);
  for (const [i, j] of pairs) {
    const left = i >= 0 ? { num: group.aStart + i + 1, parts: aParts[i] } : null;
    const right = j >= 0 ? { num: group.bStart + j + 1, parts: bParts[j] } : null;
    view.rows.push({ kind: left && right ? 'change' : left ? 'delete' : 'insert', left, right });
  }
  aParts.forEach((parts, t) => view.inline.push({ kind: 'delete', aNum: group.aStart + t + 1, bNum: null, parts }));
  bParts.forEach((parts, t) => view.inline.push({ kind: 'insert', aNum: null, bNum: group.bStart + t + 1, parts }));
}

/**
 * Lines mode: the words that differ inside each paired line are highlighted
 * and the words they share count towards the similarity; lines without a
 * partner get no highlights.
 * @param {object} view
 * @param {string[]} aLines
 * @param {string[]} bLines
 * @param {Array<[number, number]>} pairs from {@link alignLines}
 * @param {Options} opts
 * @returns {{aParts: Part[][], bParts: Part[][]}}
 */
function highlightPairs(view, aLines, bLines, pairs, opts) {
  const aParts = aLines.map((line) => lineParts(line, false));
  const bParts = bLines.map((line) => lineParts(line, false));
  for (const [i, j] of pairs) {
    if (i < 0 || j < 0) continue;
    const fine = fineDiff(view, aLines[i], bLines[j], 'words', opts);
    aParts[i] = fine.aParts[0];
    bParts[j] = fine.bParts[0];
  }
  pushEdit(view.script, 'delete', aLines.join(''));
  pushEdit(view.script, 'insert', bLines.join(''));
  return { aParts, bParts };
}

/**
 * Words/chars mode: the whole block is diffed at that granularity.
 * @returns {{aParts: Part[][], bParts: Part[][]}}
 */
function highlightBlock(view, aLines, bLines, opts) {
  const fine = fineDiff(view, aLines.join(''), bLines.join(''), opts.mode, opts);
  for (const edit of fine.edits) pushEdit(view.script, edit.type, edit.text);
  return fine;
}

/**
 * Diffs two snippets at a fine granularity with semantic cleanup, spending
 * the snippets' share of the comparison's search budget, and adds the
 * characters they share (and a diff that ran out of budget) to the view.
 * @param {object} view
 * @param {string} aText
 * @param {string} bText
 * @param {Mode} mode "words" or "chars"
 * @param {Options} opts
 * @returns {{aParts: Part[][], bParts: Part[][], edits: Edit[]}}
 */
function fineDiff(view, aText, bText, mode, opts) {
  const aTokens = tokenize(aText, mode);
  const bTokens = tokenize(bText, mode);
  const { aKeys, bKeys } = internKeys(aTokens, bTokens, mode, opts);
  const share = (FINE_STEPS * (aText.length + bText.length)) / view.changedLength;
  const { runs, complete } = diffWithBudget(aKeys, bKeys, Math.max(MIN_FINE_STEPS, share));
  if (!complete) view.coarse++;
  const cleaned = cleanupSemantic({ aTokens, bTokens, aKeys, bKeys, runs });
  const aChanged = new Uint8Array(aTokens.length);
  const bChanged = new Uint8Array(bTokens.length);
  for (const run of cleaned) {
    if (run.type === 'delete') aChanged.fill(1, run.aStart, run.aStart + run.count);
    else if (run.type === 'insert') bChanged.fill(1, run.bStart, run.bStart + run.count);
    else view.matched += textLength(aTokens, run.aStart, run.count) + textLength(bTokens, run.bStart, run.count);
  }
  return {
    aParts: partsByLine(aTokens, aChanged, opts.ignoreWhitespace),
    bParts: partsByLine(bTokens, bChanged, opts.ignoreWhitespace),
    edits: toEdits({ aTokens, bTokens }, cleaned),
  };
}

/** @returns {number} total length of tokens[start..start+count) */
function textLength(tokens, start, count) {
  let length = 0;
  for (let i = start; i < start + count; i++) length += tokens[i].length;
  return length;
}

/**
 * Splits flagged tokens into lines of parts. With `quietSpace`, changes that
 * are only horizontal whitespace are not highlighted.
 * @param {string[]} tokens
 * @param {Uint8Array} changed
 * @param {boolean} quietSpace
 * @returns {Part[][]}
 */
function partsByLine(tokens, changed, quietSpace) {
  const lines = [[]];
  tokens.forEach((token, i) => {
    const flag = changed[i] === 1 && !(quietSpace && isSpace(token));
    const parts = lines[lines.length - 1];
    const last = parts[parts.length - 1];
    if (isLineBreak(token)) {
      parts.push({ text: token, changed: flag });
      lines.push([]);
    } else if (last && last.changed === flag) {
      last.text += token;
    } else {
      parts.push({ text: token, changed: flag });
    }
  });
  if (lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

/**
 * @param {string} line a line with or without its terminator
 * @param {boolean} changed
 * @returns {Part[]} the text and, separately, the line break
 */
function lineParts(line, changed) {
  const body = line.replace(/\r?\n$/, '');
  const parts = body ? [{ text: body, changed }] : [];
  if (body.length < line.length) parts.push({ text: line.slice(body.length), changed });
  return parts;
}

/** Appends an edit, merging it into the previous one of the same type. */
function pushEdit(script, type, text) {
  if (!text) return;
  const last = script[script.length - 1];
  if (last && last.type === type) last.text += text;
  else script.push({ type, text });
}

/** @returns {Stats} */
function computeStats(view, totalLength) {
  const count = (kind) => view.rows.reduce((n, row) => (row.kind === kind ? n + 1 : n), 0);
  return {
    added: count('insert'),
    removed: count('delete'),
    changed: count('change'),
    similarity: totalLength === 0 ? 100 : (100 * view.matched) / totalLength,
  };
}
