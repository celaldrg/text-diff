/**
 * Unified diff ("diff -u" format): writer, parser and patch applier.
 * @module unified
 */

import { changeGroups, diffText } from './diff.js';
import { splitLines } from './tokens.js';

/** @typedef {import('./diff.js').TokenDiff} TokenDiff */
/** @typedef {import('./diff.js').ChangeGroup} ChangeGroup */

/**
 * One line of a hunk. `newline` is false when the line is the last line of
 * its file and has no line break ("\ No newline at end of file").
 * @typedef {{op: ' '|'-'|'+', text: string, newline: boolean}} HunkLine
 */

/**
 * @typedef {object} Hunk
 * @property {number} oldStart as written in the header
 * @property {number} oldLines
 * @property {number} newStart
 * @property {number} newLines
 * @property {HunkLine[]} lines
 * @property {number} line 1-based line of the "@@" header in the patch text
 */

/** @typedef {{oldName: string, newName: string, hunks: Hunk[]}} Patch */

/**
 * @typedef {{ok: true, patch: Patch} | {ok: false, error: string, line: number}} ParseResult
 * error is one of "no-hunks", "bad-header", "bad-line", "too-many-lines",
 * "truncated" or "multiple-files"; line is 1-based in the patch text.
 */

/**
 * @typedef {{ok: true, text: string} | {ok: false, error: string, line: number, hunk?: number}} ApplyResult
 * On a hunk that does not apply, error is "hunk-failed" and `hunk` is its 0-based index.
 */

const NO_NEWLINE = '\\ No newline at end of file';
const HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Compares two texts line by line and returns a unified diff.
 * @param {string} a old text
 * @param {string} b new text
 * @param {{context?: number, ignoreWhitespace?: boolean, ignoreCase?: boolean, ignoreBlankLines?: boolean, oldName?: string, newName?: string}} [options]
 * @returns {string} "" when the texts do not differ
 */
export function unifiedDiff(a, b, options = {}) {
  const lines = diffText(a, b, { ...options, mode: 'lines' });
  return formatUnified(lines, changeGroups(lines, options.ignoreBlankLines), options);
}

/**
 * Writes the hunks of a line diff the way GNU diff does: a change joins the
 * previous hunk when at most 2 * context unchanged lines lie between them
 * (fewer than context for an ignorable change), and a hunk whose changes are
 * all ignorable is left out. Unlike GNU diff, hunks never overlap.
 * @param {TokenDiff} lines diff made in "lines" mode
 * @param {ChangeGroup[]} groups its change groups
 * @param {{context?: number, oldName?: string, newName?: string}} [options]
 * @returns {string}
 */
export function formatUnified(lines, groups, { context = 3, oldName = 'a', newName = 'b' } = {}) {
  const hunks = splitIntoHunks(groups, context);
  if (hunks.length === 0) return '';
  const out = [`--- ${oldName}`, `+++ ${newName}`];
  for (const hunk of hunks) writeHunk(out, lines, hunk, context);
  return out.join('\n') + '\n';
}

/**
 * Groups the changes into the hunks that get printed.
 * @param {ChangeGroup[]} groups
 * @param {number} context
 * @returns {ChangeGroup[][]}
 */
function splitIntoHunks(groups, context) {
  const hunks = [];
  for (const group of groups) {
    const hunk = hunks[hunks.length - 1];
    const gap = hunk ? group.aStart - hunk[hunk.length - 1].aEnd : Infinity;
    if (gap < (group.ignorable ? context : 2 * context + 1)) hunk.push(group);
    else hunks.push([group]);
  }
  const shown = [];
  for (const hunk of hunks) {
    if (hunk.every((g) => g.ignorable)) continue;
    const previous = shown[shown.length - 1];
    if (previous && hunk[0].aStart - previous[previous.length - 1].aEnd < 2 * context) {
      for (const group of hunk) previous.push(group);
    } else {
      shown.push(hunk);
    }
  }
  return shown;
}

/**
 * Appends the header and the lines of one hunk to `out`.
 * @param {string[]} out
 * @param {TokenDiff} lines
 * @param {ChangeGroup[]} hunk
 * @param {number} context
 */
function writeHunk(out, lines, hunk, context) {
  const first = hunk[0];
  const last = hunk[hunk.length - 1];
  const aLo = Math.max(0, first.aStart - context);
  const aHi = Math.min(lines.aTokens.length, last.aEnd + context);
  const bLo = Math.max(0, first.bStart - context);
  const bHi = Math.min(lines.bTokens.length, last.bEnd + context);
  out.push(`@@ -${range(aLo, aHi - aLo)} +${range(bLo, bHi - bLo)} @@`);
  let a = aLo;
  for (const group of hunk) {
    writeLines(out, ' ', lines.aTokens, a, group.aStart);
    writeLines(out, '-', lines.aTokens, group.aStart, group.aEnd);
    writeLines(out, '+', lines.bTokens, group.bStart, group.bEnd);
    a = group.aEnd;
  }
  writeLines(out, ' ', lines.aTokens, a, aHi);
}

/** Appends lines[from..to) with a prefix, marking a missing final line break. */
function writeLines(out, prefix, lines, from, to) {
  for (let i = from; i < to; i++) {
    const line = lines[i];
    if (line.endsWith('\n')) {
      out.push(prefix + line.slice(0, -1));
    } else {
      out.push(prefix + line, NO_NEWLINE);
    }
  }
}

/**
 * Formats a hunk range like GNU diff: "start,count", just "start" for one
 * line, and the line before the range for an empty range.
 * @param {number} start 0-based first line
 * @param {number} count
 * @returns {string}
 */
function range(start, count) {
  if (count === 0) return `${start},0`;
  return count === 1 ? `${start + 1}` : `${start + 1},${count}`;
}

/**
 * Parses a single-file unified diff. Lines before the first "@@" header
 * (such as "diff --git" or "index") are skipped; the "---"/"+++" names are
 * kept. After the first hunk, stray hunk lines or a second file are errors.
 * @param {string} text
 * @returns {ParseResult}
 */
export function parseUnified(text) {
  const rows = text.split('\n');
  if (rows[rows.length - 1] === '') rows.pop();
  const patch = { oldName: 'a', newName: 'b', hunks: [] };
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.startsWith('@@')) {
      const parsed = parseHunk(rows, i);
      if (!parsed.ok) return parsed;
      patch.hunks.push(parsed.hunk);
      i = parsed.next;
    } else if (row.startsWith('--- ') && rows[i + 1]?.startsWith('+++ ')) {
      if (patch.hunks.length > 0) return { ok: false, error: 'multiple-files', line: i + 1 };
      patch.oldName = fileName(row);
      patch.newName = fileName(rows[i + 1]);
      i += 2;
    } else if (patch.hunks.length > 0 && /^[ +\-\\]/.test(row)) {
      return { ok: false, error: 'bad-line', line: i + 1 };
    } else {
      i++;
    }
  }
  if (patch.hunks.length === 0) return { ok: false, error: 'no-hunks', line: 1 };
  return { ok: true, patch };
}

/** @returns {string} the file name of a "---"/"+++" line, without a timestamp or a "\r" */
function fileName(row) {
  return row.slice(4).replace(/\r$/, '').split('\t')[0];
}

/**
 * Parses the hunk whose header is rows[start].
 * @param {string[]} rows
 * @param {number} start
 * @returns {{ok: true, hunk: Hunk, next: number} | {ok: false, error: string, line: number}}
 */
function parseHunk(rows, start) {
  const match = HEADER_RE.exec(rows[start]);
  if (!match) return { ok: false, error: 'bad-header', line: start + 1 };
  const [oldStart, oldLines, newStart, newLines] = [match[1], match[2] ?? '1', match[3], match[4] ?? '1'].map(Number);
  const hunk = { oldStart, oldLines, newStart, newLines, lines: [], line: start + 1 };
  let oldSeen = 0;
  let newSeen = 0;
  let i = start + 1;
  while (oldSeen < oldLines || newSeen < newLines || rows[i]?.startsWith('\\')) {
    if (i >= rows.length) return { ok: false, error: 'truncated', line: i };
    const row = rows[i];
    const op = row === '' ? ' ' : row[0];
    if (op === '\\') {
      const previous = hunk.lines[hunk.lines.length - 1];
      if (!previous) return { ok: false, error: 'bad-line', line: i + 1 };
      previous.newline = false;
    } else if (op === ' ' || op === '-' || op === '+') {
      if (op !== '+') oldSeen++;
      if (op !== '-') newSeen++;
      if (oldSeen > oldLines || newSeen > newLines) return { ok: false, error: 'too-many-lines', line: i + 1 };
      hunk.lines.push({ op, text: row.slice(1), newline: true });
    } else {
      return { ok: false, error: 'bad-line', line: i + 1 };
    }
    i++;
  }
  return { ok: true, hunk, next: i };
}

/**
 * Applies a unified diff to a text. Each hunk is looked for at its stated
 * line first and then at growing distances (like `patch` without fuzz).
 * @param {string} source the old text
 * @param {Patch|string} patch a parsed patch or the patch text
 * @returns {ApplyResult}
 */
export function applyPatch(source, patch) {
  if (typeof patch === 'string') {
    const parsed = parseUnified(patch);
    if (!parsed.ok) return parsed;
    patch = parsed.patch;
  }
  const lines = splitLines(source);
  const out = [];
  let cursor = 0;
  let offset = 0;
  for (const [index, hunk] of patch.hunks.entries()) {
    const before = hunk.lines.filter((l) => l.op !== '+').map(lineText);
    const after = hunk.lines.filter((l) => l.op !== '-').map(lineText);
    const stated = hunk.oldLines === 0 ? hunk.oldStart : hunk.oldStart - 1;
    const at = locate(lines, before, stated + offset, cursor);
    if (at < 0) return { ok: false, error: 'hunk-failed', line: hunk.line, hunk: index };
    for (let i = cursor; i < at; i++) out.push(lines[i]);
    for (const line of after) out.push(line);
    cursor = at + before.length;
    offset = at - stated;
  }
  for (let i = cursor; i < lines.length; i++) out.push(lines[i]);
  return { ok: true, text: out.join('') };
}

/** @returns {string} the hunk line as it appears in a text, with its line break */
function lineText(line) {
  return line.newline ? `${line.text}\n` : line.text;
}

/**
 * Finds where `needle` occurs in `lines`, nearest to `expected`, not before `min`.
 * @param {string[]} lines
 * @param {string[]} needle
 * @param {number} expected
 * @param {number} min
 * @returns {number} index, or -1
 */
function locate(lines, needle, expected, min) {
  const max = lines.length - needle.length;
  if (max < min) return -1;
  const target = Math.min(Math.max(expected, min), max);
  for (let distance = 0; target - distance >= min || target + distance <= max; distance++) {
    if (target + distance <= max && matchesAt(lines, needle, target + distance)) return target + distance;
    if (distance > 0 && target - distance >= min && matchesAt(lines, needle, target - distance)) return target - distance;
  }
  return -1;
}

/** @returns {boolean} true when lines[at..] starts with needle */
function matchesAt(lines, needle, at) {
  for (let i = 0; i < needle.length; i++) if (lines[at + i] !== needle[i]) return false;
  return true;
}
