/**
 * Myers' O(ND) difference algorithm with the linear-space "middle snake"
 * refinement (E. W. Myers, "An O(ND) Difference Algorithm and Its
 * Variations", 1986). Pure: no DOM, no globals.
 * @module myers
 */

/**
 * One run of an edit script.
 * - `equal`: a[aStart .. aStart+count) matches b[bStart .. bStart+count)
 * - `delete`: a[aStart .. aStart+count) is removed; bStart is the position in b
 * - `insert`: b[bStart .. bStart+count) is added; aStart is the position in a
 * @typedef {object} Run
 * @property {'equal'|'delete'|'insert'} type
 * @property {number} aStart
 * @property {number} bStart
 * @property {number} count
 */

/**
 * Computes a minimal edit script that turns sequence `a` into sequence `b`.
 * Elements are compared with `===`, so map tokens to numbers or strings first.
 * Runs are maximal, never empty, and inside one change the delete run comes
 * before the insert run.
 * @param {ArrayLike<unknown>} a
 * @param {ArrayLike<unknown>} b
 * @returns {Run[]}
 */
export function diffSequences(a, b) {
  return diffWithBudget(a, b, Infinity).runs;
}

/** Fewest rounds a search may take before it splits where it got furthest. */
const MIN_CAP = 16;

/**
 * Computes an edit script like {@link diffSequences} but spends at most
 * about `budget` steps searching for it. A step is one diagonal tried or one
 * matching pair followed; common prefixes and suffixes and elements that only
 * one side has cost nothing. With a finite budget, a search for a split point
 * that needs more than sqrt(budget) / 16 rounds (one round per edit) stops
 * and splits where it got furthest, as GNU diff does: the cost then grows
 * with the number of edits instead of its square, and the script may be a
 * little longer than minimal. Once the budget is spent, every part still to
 * be searched becomes a plain replacement, so the script stays valid but can
 * be far from minimal.
 * @param {ArrayLike<unknown>} a
 * @param {ArrayLike<unknown>} b
 * @param {number} budget the most search steps to take (Infinity: no limit, minimal script)
 * @returns {{runs: Run[], complete: boolean}} complete is false when the budget ran out
 *   and part of the sequences was replaced without a search
 */
export function diffWithBudget(a, b, budget) {
  const removed = new Uint8Array(a.length);
  const added = new Uint8Array(b.length);
  // An element that the other side lacks can never match: mark it now and
  // search only the others, which keeps the script minimal (as GNU diff does).
  const aKept = markUnmatched(a, b, removed);
  const bKept = markUnmatched(b, a, added);
  const size = aKept.length + bKept.length + 4;
  const ctx = {
    a: aKept.map((i) => a[i]),
    b: bKept.map((j) => b[j]),
    removed: new Uint8Array(aKept.length),
    added: new Uint8Array(bKept.length),
    forward: new Int32Array(size),
    backward: new Int32Array(size),
    budget,
    cap: Math.max(MIN_CAP, Math.floor(Math.sqrt(budget) / 16)),
    complete: true,
  };
  compareRange(ctx, 0, aKept.length, 0, bKept.length);
  aKept.forEach((i, t) => {
    removed[i] = ctx.removed[t];
  });
  bKept.forEach((j, t) => {
    added[j] = ctx.added[t];
  });
  return { runs: buildRuns(removed, added), complete: ctx.complete };
}

/**
 * Marks the elements of `seq` that `other` does not contain.
 * @param {ArrayLike<unknown>} seq
 * @param {ArrayLike<unknown>} other
 * @param {Uint8Array} marks set to 1 at every element of `seq` that `other` lacks
 * @returns {number[]} indices of the elements that `other` contains
 */
function markUnmatched(seq, other, marks) {
  const present = new Set();
  for (let j = 0; j < other.length; j++) present.add(other[j]);
  const kept = [];
  for (let i = 0; i < seq.length; i++) {
    if (present.has(seq[i])) kept.push(i);
    else marks[i] = 1;
  }
  return kept;
}

/**
 * Marks the removed and added elements of a[aLo..aHi) versus b[bLo..bHi).
 * A range that the search gives up on (once the budget is spent) is marked
 * as replaced.
 * @param {object} ctx
 * @param {number} aLo
 * @param {number} aHi
 * @param {number} bLo
 * @param {number} bHi
 */
function compareRange(ctx, aLo, aHi, bLo, bHi) {
  const { a, b } = ctx;
  while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
    aLo++;
    bLo++;
  }
  while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) {
    aHi--;
    bHi--;
  }
  if (aLo < aHi && bLo < bHi) {
    const split = middleSnake(ctx, aLo, aHi, bLo, bHi);
    if (split) {
      const [x, y] = split;
      // The smaller part goes first: after a capped search it is the cheap
      // one, so it gets searched in full before the budget can run out.
      if (x - aLo + (y - bLo) <= aHi - x + (bHi - y)) {
        compareRange(ctx, aLo, x, bLo, y);
        compareRange(ctx, x, aHi, y, bHi);
      } else {
        compareRange(ctx, x, aHi, y, bHi);
        compareRange(ctx, aLo, x, bLo, y);
      }
      return;
    }
    ctx.complete = false;
  }
  // One side is empty, or the search gave up: what is left is replaced.
  ctx.removed.fill(1, aLo, aHi);
  ctx.added.fill(1, bLo, bHi);
}

/**
 * Finds a point on an optimal edit path by running the forward and the
 * reverse search at the same time until they overlap. Both ranges are
 * non-empty and start and end with different elements, so the returned
 * point is strictly inside the rectangle and both halves are smaller.
 *
 * Diagonals are k = x - y relative to (aLo, bLo); the reverse search uses
 * mirrored coordinates measured from (aHi, bHi). Points that leave the grid
 * are kept (they never snake) but are never used to detect an overlap.
 * Every round of the search is charged to `ctx.budget`. A search that gets
 * to round `ctx.cap` stops and splits at {@link furthestPoint} instead,
 * which is not always on an optimal path.
 * @returns {[number, number]|null} absolute split point [x, y], or null when the search gives up
 */
function middleSnake(ctx, aLo, aHi, bLo, bHi) {
  const { a, b, forward: vf, backward: vb } = ctx;
  const n = aHi - aLo;
  const m = bHi - bLo;
  const delta = n - m;
  const odd = (delta & 1) === 1;
  const maxD = (n + m + 1) >> 1;
  const off = maxD + 1;
  vf[off + 1] = 0;
  vb[off + 1] = 0;
  for (let d = 0; d <= maxD; d++) {
    if (ctx.budget < 0) return null;
    if (d === ctx.cap) return furthestPoint(ctx, aLo, aHi, bLo, bHi, off, d - 1);
    let steps = 2 * d + 2;
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && vf[off + k - 1] < vf[off + k + 1]) ? vf[off + k + 1] : vf[off + k - 1] + 1;
      let y = x - k;
      const start = x;
      while (x < n && y < m && a[aLo + x] === b[bLo + y]) {
        x++;
        y++;
      }
      steps += x - start;
      vf[off + k] = x;
      const kr = delta - k;
      if (odd && kr >= 1 - d && kr <= d - 1 && inGrid(x, y, n, m)) {
        const xr = vb[off + kr];
        if (inGrid(xr, xr - kr, n, m) && x + xr >= n) return [aLo + x, bLo + y];
      }
    }
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && vb[off + k - 1] < vb[off + k + 1]) ? vb[off + k + 1] : vb[off + k - 1] + 1;
      let y = x - k;
      const start = x;
      while (x < n && y < m && a[aHi - 1 - x] === b[bHi - 1 - y]) {
        x++;
        y++;
      }
      steps += x - start;
      vb[off + k] = x;
      const kf = delta - k;
      if (!odd && kf >= -d && kf <= d && inGrid(x, y, n, m)) {
        const xf = vf[off + kf];
        if (inGrid(xf, xf - kf, n, m) && x + xf >= n) return [aHi - x, bHi - y];
      }
    }
    ctx.budget -= steps;
  }
  throw new Error('middleSnake: no overlap found');
}

/**
 * Picks a split point for a search stopped at its round cap: of the points
 * that the forward and the reverse search reached in their last round, the
 * one furthest from its own corner. The part between that corner and the
 * point has few edits, so searching it is cheap. Both parts are smaller than
 * the range, because the search did not meet: neither direction got to the
 * opposite corner.
 * @param {object} ctx
 * @param {number} aLo
 * @param {number} aHi
 * @param {number} bLo
 * @param {number} bHi
 * @param {number} off index of diagonal 0 in the V arrays
 * @param {number} last the last round both searches finished (at least 1)
 * @returns {[number, number]|null} absolute split point [x, y], or null when no point left its corner
 */
function furthestPoint(ctx, aLo, aHi, bLo, bHi, off, last) {
  const n = aHi - aLo;
  const m = bHi - bLo;
  let best = 0;
  let split = null;
  for (let k = -last; k <= last; k += 2) {
    const x = ctx.forward[off + k];
    if (inGrid(x, x - k, n, m) && 2 * x - k > best) {
      best = 2 * x - k;
      split = [aLo + x, bLo + x - k];
    }
    const xr = ctx.backward[off + k];
    if (inGrid(xr, xr - k, n, m) && 2 * xr - k > best) {
      best = 2 * xr - k;
      split = [aHi - xr, bHi - xr + k];
    }
  }
  return split;
}

/** @returns {boolean} true when (x, y) lies inside the n x m edit graph */
function inGrid(x, y, n, m) {
  return x <= n && y <= m;
}

/**
 * Turns the removed/added marks into maximal runs.
 * @param {Uint8Array} removed
 * @param {Uint8Array} added
 * @returns {Run[]}
 */
function buildRuns(removed, added) {
  const runs = [];
  const n = removed.length;
  const m = added.length;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const i0 = i;
    const j0 = j;
    if (i < n && j < m && !removed[i] && !added[j]) {
      while (i < n && j < m && !removed[i] && !added[j]) {
        i++;
        j++;
      }
      runs.push({ type: 'equal', aStart: i0, bStart: j0, count: i - i0 });
      continue;
    }
    while (i < n && removed[i]) i++;
    while (j < m && added[j]) j++;
    if (i > i0) runs.push({ type: 'delete', aStart: i0, bStart: j0, count: i - i0 });
    if (j > j0) runs.push({ type: 'insert', aStart: i, bStart: j0, count: j - j0 });
  }
  return runs;
}
