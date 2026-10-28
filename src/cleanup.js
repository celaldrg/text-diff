/**
 * Semantic cleanup for word and character diffs: a minimal edit script is
 * often fragmented ("q[uan]t[it]y"), so small equalities that sit between
 * edits are folded into them, and lone edits slide to natural boundaries.
 * The result is still a valid edit script, just not always a minimal one.
 * @module cleanup
 */

import { isLineBreak, isSpace, isWordToken } from './tokens.js';

/** @typedef {import('./myers.js').Run} Run */
/** @typedef {import('./diff.js').TokenDiff} TokenDiff */

/**
 * A normalized stretch of the script: an equality (aCount === bCount) or a
 * change that replaces a[aStart..+aCount) with b[bStart..+bCount).
 * @typedef {{equal: boolean, aStart: number, aCount: number, bStart: number, bCount: number}} Block
 */

/**
 * Returns a cleaned-up copy of `diff.runs`:
 * 1. an equality no longer (in characters) than the edits on both of its
 *    sides is merged into them, repeatedly;
 * 2. tokens that both sides of a merged change start or end with move back
 *    into the neighbouring equalities;
 * 3. a lone insertion or deletion between two equalities slides to the
 *    position with the best boundary (line start, space, punctuation).
 * @param {TokenDiff} diff
 * @returns {Run[]}
 */
export function cleanupSemantic(diff) {
  const blocks = factorAffixes(diff, mergeSmallEqualities(diff, toBlocks(diff.runs)));
  for (let i = 1; i + 1 < blocks.length; i++) {
    const block = blocks[i];
    if (!block.equal && (block.aCount === 0 || block.bCount === 0)) {
      slideEdit(diff, blocks[i - 1], block, blocks[i + 1]);
    }
  }
  return fromBlocks(toBlocks(fromBlocks(blocks)));
}

/**
 * @param {TokenDiff} diff
 * @param {Block[]} blocks
 * @returns {Block[]}
 */
function mergeSmallEqualities(diff, blocks) {
  const aSums = prefixLengths(diff.aTokens);
  const bSums = prefixLengths(diff.bTokens);
  const width = (block) =>
    Math.max(
      aSums[block.aStart + block.aCount] - aSums[block.aStart],
      bSums[block.bStart + block.bCount] - bSums[block.bStart],
    );
  const out = [];
  for (const block of blocks) {
    out.push(block);
    while (out.length >= 3) {
      const after = out[out.length - 1];
      const middle = out[out.length - 2];
      const before = out[out.length - 3];
      if (after.equal || !middle.equal || before.equal) break;
      if (width(middle) > width(before) || width(middle) > width(after)) break;
      out.splice(-3, 3, {
        equal: false,
        aStart: before.aStart,
        bStart: before.bStart,
        aCount: before.aCount + middle.aCount + after.aCount,
        bCount: before.bCount + middle.bCount + after.bCount,
      });
    }
  }
  return out;
}

/**
 * Splits the common prefix and suffix off every change that deletes and
 * inserts ("-ab +ac" becomes "=a -b +c"), then joins neighbouring equalities.
 * Identical runs of spaces count as common even when their keys differ
 * (see tokenKeys), so " old" -> " new" keeps its space unchanged.
 * @param {TokenDiff} diff
 * @param {Block[]} blocks
 * @returns {Block[]}
 */
function factorAffixes(diff, blocks) {
  const { aTokens, bTokens, aKeys, bKeys } = diff;
  const same = (i, j) => aKeys[i] === bKeys[j] || (isSpace(aTokens[i]) && aTokens[i] === bTokens[j]);
  const out = [];
  for (const block of blocks) {
    const { aStart, bStart, aCount, bCount } = block;
    if (block.equal || aCount === 0 || bCount === 0) {
      out.push(block);
      continue;
    }
    const limit = Math.min(aCount, bCount);
    let prefix = 0;
    while (prefix < limit && same(aStart + prefix, bStart + prefix)) prefix++;
    let suffix = 0;
    while (prefix + suffix < limit && same(aStart + aCount - 1 - suffix, bStart + bCount - 1 - suffix)) suffix++;
    out.push(
      { equal: true, aStart, bStart, aCount: prefix, bCount: prefix },
      {
        equal: false,
        aStart: aStart + prefix,
        bStart: bStart + prefix,
        aCount: aCount - prefix - suffix,
        bCount: bCount - prefix - suffix,
      },
      { equal: true, aStart: aStart + aCount - suffix, bStart: bStart + bCount - suffix, aCount: suffix, bCount: suffix },
    );
  }
  return toBlocks(fromBlocks(out));
}

/**
 * Moves a pure insertion or deletion inside the range where shifting it
 * keeps the script valid, picking the best scoring boundary (ties go right).
 * Mutates the three blocks; an equality may end up empty.
 * @param {TokenDiff} diff
 * @param {Block} left equality before the edit
 * @param {Block} edit
 * @param {Block} right equality after the edit
 */
function slideEdit(diff, left, edit, right) {
  const inB = edit.bCount > 0;
  const tokens = inB ? diff.bTokens : diff.aTokens;
  const keys = inB ? diff.bKeys : diff.aKeys;
  const start = inB ? edit.bStart : edit.aStart;
  const count = inB ? edit.bCount : edit.aCount;
  let back = 0;
  while (back < left.aCount && keys[start - back - 1] === keys[start + count - back - 1]) back++;
  let ahead = 0;
  while (ahead < right.aCount && keys[start + ahead] === keys[start + count + ahead]) ahead++;
  let best = 0;
  let bestScore = -1;
  for (let shift = -back; shift <= ahead; shift++) {
    const s = start + shift;
    const score = boundaryScore(tokens[s - 1], tokens[s]) + boundaryScore(tokens[s + count - 1], tokens[s + count]);
    if (score >= bestScore) {
      bestScore = score;
      best = shift;
    }
  }
  left.aCount += best;
  left.bCount += best;
  edit.aStart += best;
  edit.bStart += best;
  right.aStart += best;
  right.bStart += best;
  right.aCount -= best;
  right.bCount -= best;
}

/**
 * Scores the boundary between two neighbouring tokens; higher reads better.
 * @param {string|undefined} before token before the boundary (undefined at the start)
 * @param {string|undefined} after token after the boundary (undefined at the end)
 * @returns {number}
 */
function boundaryScore(before, after) {
  if (before === undefined || after === undefined) return 5;
  if (isLineBreak(before)) return 4;
  if (isLineBreak(after)) return 3;
  if (isSpace(before) || isSpace(after)) return 2;
  return isWordToken(before) && isWordToken(after) ? 0 : 1;
}

/**
 * @param {string[]} tokens
 * @returns {Float64Array} sums[i] = total length of tokens[0..i)
 */
function prefixLengths(tokens) {
  const sums = new Float64Array(tokens.length + 1);
  for (let i = 0; i < tokens.length; i++) sums[i + 1] = sums[i] + tokens[i].length;
  return sums;
}

/**
 * Folds runs into alternating equality and change blocks, skipping empty runs.
 * @param {Run[]} runs
 * @returns {Block[]}
 */
function toBlocks(runs) {
  const blocks = [];
  for (const run of runs) {
    if (run.count === 0) continue;
    const equal = run.type === 'equal';
    const aCount = run.type === 'insert' ? 0 : run.count;
    const bCount = run.type === 'delete' ? 0 : run.count;
    const last = blocks[blocks.length - 1];
    if (last && last.equal === equal) {
      last.aCount += aCount;
      last.bCount += bCount;
    } else {
      blocks.push({ equal, aStart: run.aStart, bStart: run.bStart, aCount, bCount });
    }
  }
  return blocks;
}

/**
 * @param {Block[]} blocks
 * @returns {Run[]}
 */
function fromBlocks(blocks) {
  const runs = [];
  for (const block of blocks) {
    const { aStart, bStart, aCount, bCount } = block;
    if (block.equal) {
      if (aCount > 0) runs.push({ type: 'equal', aStart, bStart, count: aCount });
      continue;
    }
    if (aCount > 0) runs.push({ type: 'delete', aStart, bStart, count: aCount });
    if (bCount > 0) runs.push({ type: 'insert', aStart: aStart + aCount, bStart, count: bCount });
  }
  return runs;
}
