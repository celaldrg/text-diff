import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSequences, diffWithBudget } from '../src/myers.js';

/** Number of inserted plus deleted elements. */
const cost = (runs) => runs.reduce((n, run) => (run.type === 'equal' ? n : n + run.count), 0);

/** Checks that the runs cover a and b in order and that equal runs really match. */
function assertValid(a, b, runs) {
  let i = 0;
  let j = 0;
  for (const run of runs) {
    assert.ok(run.count > 0, 'runs are never empty');
    assert.equal(run.aStart, i);
    assert.equal(run.bStart, j);
    if (run.type === 'equal') {
      for (let t = 0; t < run.count; t++) assert.equal(a[i + t], b[j + t]);
      i += run.count;
      j += run.count;
    } else if (run.type === 'delete') {
      i += run.count;
    } else {
      j += run.count;
    }
  }
  assert.equal(i, a.length);
  assert.equal(j, b.length);
}

/** Deterministic pseudo-random integers in [0, max) (Lehmer generator). */
function randomInts(seed, length, max) {
  let state = seed;
  return Array.from({ length }, () => {
    state = (state * 48271) % 2147483647;
    return state % max;
  });
}

test('empty inputs give an empty script', () => {
  assert.deepEqual(diffSequences([], []), []);
});

test('one empty side is a single insert or delete', () => {
  assert.deepEqual(diffSequences([], [1, 2, 3]), [{ type: 'insert', aStart: 0, bStart: 0, count: 3 }]);
  assert.deepEqual(diffSequences([1, 2, 3], []), [{ type: 'delete', aStart: 0, bStart: 0, count: 3 }]);
});

test('identical sequences are one equal run', () => {
  assert.deepEqual(diffSequences([4, 5, 6], [4, 5, 6]), [{ type: 'equal', aStart: 0, bStart: 0, count: 3 }]);
});

test('a replacement deletes before it inserts', () => {
  assert.deepEqual(diffSequences([1, 2, 3], [1, 9, 3]), [
    { type: 'equal', aStart: 0, bStart: 0, count: 1 },
    { type: 'delete', aStart: 1, bStart: 1, count: 1 },
    { type: 'insert', aStart: 2, bStart: 1, count: 1 },
    { type: 'equal', aStart: 2, bStart: 2, count: 1 },
  ]);
});

test('the example from the Myers paper needs 5 edits', () => {
  const a = 'ABCABBA';
  const b = 'CBABAC';
  const runs = diffSequences(a, b);
  assertValid(a, b, runs);
  assert.equal(cost(runs), 5);
});

test('strings work as sequences', () => {
  const runs = diffSequences('kitten', 'sitting');
  assertValid('kitten', 'sitting', runs);
  assert.equal(cost(runs), 5);
});

test('runs are maximal', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3];
  const b = [0, 1, 2, 3, 5, 6, 11, 12, 8, 9, 10, 3, 2, 1];
  const runs = diffSequences(a, b);
  assertValid(a, b, runs);
  for (let r = 1; r < runs.length; r++) {
    const pair = `${runs[r - 1].type}>${runs[r].type}`;
    assert.ok(!['equal>equal', 'delete>delete', 'insert>insert', 'insert>delete'].includes(pair), pair);
  }
});

test('long inputs with a few changes stay valid', () => {
  const a = Array.from({ length: 20000 }, (_, i) => i % 97);
  const b = a.slice();
  b.splice(5000, 3, -1, -2);
  b.splice(12000, 0, -3, -4, -5);
  b.splice(19000, 10);
  const runs = diffSequences(a, b);
  assertValid(a, b, runs);
  assert.equal(cost(runs), 3 + 2 + 3 + 10);
});

test('common ends and elements that one side lacks cost no search budget', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const b = [1, 2, 3, 40, 50, 6, 7, 8, 9];
  const { runs, complete } = diffWithBudget(a, b, 0);
  assert.equal(complete, true);
  assertValid(a, b, runs);
  assert.equal(cost(runs), 4);
});

test('an unlimited budget gives the minimal script, a spent one a valid replacement', () => {
  const a = randomInts(3, 3000, 5);
  const b = randomInts(11, 3000, 5);
  const exact = diffSequences(a, b);
  assert.deepEqual(diffWithBudget(a, b, Infinity), { runs: exact, complete: true });
  const spent = diffWithBudget(a, b, 1000);
  assert.equal(spent.complete, false);
  assertValid(a, b, spent.runs);
  assert.ok(cost(spent.runs) > cost(exact));
});

test('a small budget still finds many scattered edits one by one', () => {
  // 2,000 replacements: a full search would take about 8,000,000 steps.
  const a = randomInts(7, 20000, 50);
  const b = a.map((value, i) => (i % 10 === 5 ? (value + 1) % 50 : value));
  const { runs, complete } = diffWithBudget(a, b, 1e6);
  assert.equal(complete, true);
  assertValid(a, b, runs);
  assert.equal(cost(runs), 4000);
});
