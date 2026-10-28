/**
 * Pairs the old and new lines of one changed block so that similar lines end
 * up side by side: a small sequence alignment that maximizes the summed word
 * similarity of the paired lines. Ties pair lines in order, and very large
 * blocks simply pair in order.
 * @module align
 */

import { isLineBreak, isSpace, keyFunction, tokenize } from './tokens.js';

/** Largest old x new line count that is aligned by similarity. */
const MAX_CELLS = 4096;

/**
 * @param {string[]} aLines old lines of the block
 * @param {string[]} bLines new lines of the block
 * @param {{ignoreCase?: boolean, ignoreWhitespace?: boolean}} [options]
 * @returns {Array<[number, number]>} rows in order as [oldIndex, newIndex]; -1 marks a missing side
 */
export function alignLines(aLines, bLines, options = {}) {
  const k = aLines.length;
  const m = bLines.length;
  if (k * m > MAX_CELLS) return pairInOrder(k, m);
  const keyOf = keyFunction('words', options);
  const aProfiles = aLines.map((line) => profile(line, keyOf));
  const bProfiles = bLines.map((line) => profile(line, keyOf));
  const width = m + 1;
  const best = new Float64Array((k + 1) * width);
  const pairScore = new Float64Array(k * m);
  for (let i = k - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const score = similarity(aProfiles[i], bProfiles[j]);
      pairScore[i * m + j] = score;
      best[i * width + j] = Math.max(
        score + best[(i + 1) * width + j + 1],
        best[(i + 1) * width + j],
        best[i * width + j + 1],
      );
    }
  }
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < k && j < m) {
    const here = best[i * width + j];
    if (here === pairScore[i * m + j] + best[(i + 1) * width + j + 1]) rows.push([i++, j++]);
    else if (here === best[(i + 1) * width + j]) rows.push([i++, -1]);
    else rows.push([-1, j++]);
  }
  while (i < k) rows.push([i++, -1]);
  while (j < m) rows.push([-1, j++]);
  return rows;
}

/** @returns {Array<[number, number]>} line i paired with line i, then the leftovers */
function pairInOrder(k, m) {
  const rows = [];
  for (let t = 0; t < Math.max(k, m); t++) rows.push([t < k ? t : -1, t < m ? t : -1]);
  return rows;
}

/**
 * Counts the words and symbols of a line (spaces and line breaks skipped).
 * @param {string} line
 * @param {(token: string) => string} keyOf
 * @returns {{counts: Map<string, number>, size: number}} size is the total key length
 */
function profile(line, keyOf) {
  const counts = new Map();
  let size = 0;
  for (const token of tokenize(line, 'words')) {
    if (isSpace(token) || isLineBreak(token)) continue;
    const key = keyOf(token);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    size += key.length;
  }
  return { counts, size };
}

/**
 * Dice similarity of two profiles, weighted by token length.
 * @returns {number} 0 (nothing in common) .. 1 (same words); two blank lines score 1
 */
function similarity(p, q) {
  if (p.size + q.size === 0) return 1;
  const [small, large] = p.counts.size <= q.counts.size ? [p, q] : [q, p];
  let common = 0;
  for (const [key, count] of small.counts) common += Math.min(count, large.counts.get(key) ?? 0) * key.length;
  return (2 * common) / (p.size + q.size);
}
