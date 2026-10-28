import test from 'node:test';
import assert from 'node:assert/strict';
import { alignLines } from '../src/align.js';

test('similar lines are paired, the others stand alone', () => {
  assert.deepEqual(alignLines(['foo(1);\n', 'bar(2);\n'], ['bar(3);\n']), [
    [0, -1],
    [1, 0],
  ]);
  assert.deepEqual(alignLines(['return a;\n'], ['// note\n', 'return b;\n']), [
    [-1, 0],
    [0, 1],
  ]);
});

test('lines with nothing in common still pair in order', () => {
  assert.deepEqual(alignLines(['x\n'], ['y\n']), [[0, 0]]);
  assert.deepEqual(alignLines(['x\n', 'y\n'], ['z\n']), [
    [0, 0],
    [1, -1],
  ]);
});

test('an empty side gives one-sided rows', () => {
  assert.deepEqual(alignLines([], ['y\n', 'z\n']), [
    [-1, 0],
    [-1, 1],
  ]);
  assert.deepEqual(alignLines(['y\n'], []), [[0, -1]]);
});

test('ignoring case affects the pairing', () => {
  const old = ['x y\n', 'ALPHA BETA\n'];
  const fresh = ['alpha beta\n'];
  assert.deepEqual(alignLines(old, fresh), [
    [0, 0],
    [1, -1],
  ]);
  assert.deepEqual(alignLines(old, fresh, { ignoreCase: true }), [
    [0, -1],
    [1, 0],
  ]);
});

test('very large blocks pair in order', () => {
  const old = Array.from({ length: 100 }, (_, i) => `old ${i}\n`);
  const fresh = Array.from({ length: 101 }, (_, i) => `new ${i}\n`);
  const rows = alignLines(old, fresh);
  assert.equal(rows.length, 101);
  assert.deepEqual(rows[0], [0, 0]);
  assert.deepEqual(rows[100], [-1, 100]);
});
