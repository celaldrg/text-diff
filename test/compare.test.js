import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPTIONS, compare, normalizeOptions } from '../src/compare.js';
import { applyEdits } from '../src/diff.js';

const part = (text, changed = false) => ({ text, changed });

/** The highlighted texts of one side of a row. */
const highlights = (side) => side.parts.filter((p) => p.changed).map((p) => p.text);

/** Deterministic pseudo-random text over a few letters and spaces (Lehmer generator). */
function randomText(seed, length) {
  let state = seed;
  return Array.from({ length }, () => {
    state = (state * 48271) % 2147483647;
    return 'abcdefghij klmnopqrst '[state % 22];
  }).join('');
}

test('options get defaults and invalid values are dropped', () => {
  assert.deepEqual(normalizeOptions(), DEFAULT_OPTIONS);
  assert.deepEqual(normalizeOptions({ mode: 'pixels', context: -1 }), DEFAULT_OPTIONS);
  for (const bad of [2.5, '', ' ', null, true, '1e2', 'x', Number.NaN]) {
    assert.equal(normalizeOptions({ context: bad }).context, 3, String(bad));
  }
  assert.equal(normalizeOptions({ context: '5' }).context, 5);
  assert.equal(normalizeOptions({ context: ' 7 ' }).context, 7);
  assert.equal(normalizeOptions({ context: 0 }).context, 0);
  assert.deepEqual(normalizeOptions({ mode: 'chars', ignoreCase: 1, ignoreWhitespace: 'yes', ignoreBlankLines: true }), {
    mode: 'chars',
    ignoreWhitespace: true,
    ignoreCase: true,
    ignoreBlankLines: true,
    context: 3,
  });
});

test('identical texts have no changes', () => {
  const result = compare('a\nb\n', 'a\nb\n');
  assert.deepEqual(result.stats, { added: 0, removed: 0, changed: 0, similarity: 100 });
  assert.deepEqual(result.changes, []);
  assert.equal(result.unified, '');
  assert.deepEqual(
    result.rows.map((row) => row.kind),
    ['equal', 'equal'],
  );
  assert.deepEqual(compare('', '').stats, { added: 0, removed: 0, changed: 0, similarity: 100 });
});

test('a line comparison builds rows, inline rows, stats and navigation', () => {
  const result = compare('a\nb\nc\n', 'a\nB\nc\nd');
  assert.deepEqual(result.rows, [
    { kind: 'equal', left: { num: 1, parts: [part('a'), part('\n')] }, right: { num: 1, parts: [part('a'), part('\n')] } },
    {
      kind: 'change',
      left: { num: 2, parts: [part('b', true), part('\n')] },
      right: { num: 2, parts: [part('B', true), part('\n')] },
    },
    { kind: 'equal', left: { num: 3, parts: [part('c'), part('\n')] }, right: { num: 3, parts: [part('c'), part('\n')] } },
    { kind: 'insert', left: null, right: { num: 4, parts: [part('d')] } },
  ]);
  assert.deepEqual(
    result.inline.map((row) => [row.kind, row.aNum, row.bNum]),
    [
      ['equal', 1, 1],
      ['delete', 2, null],
      ['insert', null, 2],
      ['equal', 3, 3],
      ['insert', null, 4],
    ],
  );
  assert.deepEqual(result.changes, [
    { row: 1, inline: 1 },
    { row: 3, inline: 4 },
  ]);
  // "a\n" and "c\n" on both sides, plus the "\n" the changed line kept.
  assert.deepEqual(result.stats, { added: 1, removed: 0, changed: 1, similarity: (100 * 10) / 13 });
  assert.deepEqual(result.script, [
    { type: 'equal', text: 'a\n' },
    { type: 'delete', text: 'b\n' },
    { type: 'insert', text: 'B\n' },
    { type: 'equal', text: 'c\n' },
    { type: 'insert', text: 'd' },
  ]);
  assert.equal(
    result.unified,
    '--- a\n+++ b\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d\n\\ No newline at end of file\n',
  );
});

test('paired lines highlight the words that differ', () => {
  const result = compare('let total = price * 2;\n', 'let total = price * 3;\n');
  const [row] = result.rows;
  assert.deepEqual(row.left.parts, [part('let total = price * '), part('2', true), part(';'), part('\n')]);
  assert.deepEqual(row.right.parts, [part('let total = price * '), part('3', true), part(';'), part('\n')]);
  assert.equal(result.stats.similarity, (100 * 44) / 46, 'the words a changed line kept count as similar');
});

test('lines mode rates a lightly edited text about as similar as words mode does', () => {
  const left = 'Mix the flour and the milk.\nAdd two eggs.\nRest for ten minutes.\n';
  const right = 'Mix the flour and the oat milk.\nAdd three eggs.\nRest for ten minutes.\n';
  const lines = compare(left, right).stats.similarity;
  const words = compare(left, right, { mode: 'words' }).stats.similarity;
  assert.ok(lines > 80, String(lines));
  assert.ok(Math.abs(lines - words) < 1, `${lines} vs ${words}`);
});

test('changed lines are paired with the most similar line', () => {
  const result = compare('foo(1);\nbar(2);\n', 'bar(3);\n');
  assert.deepEqual(
    result.rows.map((row) => [row.kind, row.left?.num ?? null, row.right?.num ?? null]),
    [
      ['delete', 1, null],
      ['change', 2, 1],
    ],
  );
  assert.deepEqual(result.rows[0].left.parts, [part('foo(1);'), part('\n')]);
  // "bar(" and ");\n" of the paired lines match.
  assert.deepEqual(result.stats, { added: 0, removed: 1, changed: 1, similarity: (100 * 14) / 24 });
});

test('words mode highlights words across the block', () => {
  const result = compare('The quick brown fox\n', 'The quick red fox\n', { mode: 'words' });
  assert.deepEqual(result.rows[0].left.parts, [part('The quick '), part('brown', true), part(' fox'), part('\n')]);
  assert.deepEqual(result.rows[0].right.parts, [part('The quick '), part('red', true), part(' fox'), part('\n')]);
  assert.deepEqual(result.script, [
    { type: 'equal', text: 'The quick ' },
    { type: 'delete', text: 'brown' },
    { type: 'insert', text: 'red' },
    { type: 'equal', text: ' fox\n' },
  ]);
  assert.equal(result.stats.changed, 1);
  assert.equal(result.stats.similarity, (100 * 30) / 38);
});

test('words mode shows a moved line break as a changed part', () => {
  const result = compare('a b\n', 'a\nb\n', { mode: 'words' });
  assert.deepEqual(result.rows, [
    {
      kind: 'change',
      left: { num: 1, parts: [part('a'), part(' ', true), part('b'), part('\n')] },
      right: { num: 1, parts: [part('a'), part('\n', true)] },
    },
    { kind: 'insert', left: null, right: { num: 2, parts: [part('b'), part('\n')] } },
  ]);
});

test('chars mode highlights single characters', () => {
  const result = compare('color\n', 'colour\n', { mode: 'chars' });
  assert.deepEqual(result.rows[0].left.parts, [part('color'), part('\n')]);
  assert.deepEqual(result.rows[0].right.parts, [part('colo'), part('u', true), part('r'), part('\n')]);
  assert.equal(result.stats.similarity, (100 * 12) / 13);
});

test('Windows line breaks are parts of their own', () => {
  const result = compare('a\r\nb\r\n', 'a\r\nc\r\n');
  assert.deepEqual(result.rows[1].left.parts, [part('b', true), part('\r\n')]);
  assert.deepEqual(result.rows[1].right.parts, [part('c', true), part('\r\n')]);
});

test('a rename across 300 lines keeps per-word highlights in every mode', () => {
  const left = Array.from({ length: 300 }, (_, i) => `  total = total + oldName[${i}];\n`).join('');
  const right = left.replaceAll('oldName', 'newName');
  for (const [mode, before, after] of [
    ['lines', 'oldName', 'newName'],
    ['words', 'oldName', 'newName'],
    ['chars', 'old', 'new'],
  ]) {
    const result = compare(left, right, { mode });
    assert.equal(result.rows.length, 300, mode);
    for (const row of result.rows) {
      assert.equal(row.kind, 'change', mode);
      assert.deepEqual(highlights(row.left), [before], mode);
      assert.deepEqual(highlights(row.right), [after], mode);
    }
    assert.ok(result.stats.similarity > 75, `${mode}: ${result.stats.similarity}`);
    assert.equal(result.coarse, 0, mode);
    assert.equal(applyEdits(left, result.script), right, mode);
  }
});

test('one small edit in a very long line is highlighted on its own in every mode', () => {
  const minified = Array.from({ length: 1600 }, (_, i) => `v${i}=f(${i},"k${i % 7}");`).join('');
  const words = 'the of and to in is was for on that with as by at from his her an were are which this'.split(' ');
  const prose = Array.from({ length: 6000 }, (_, i) => words[(i * 7 + (i >> 3)) % words.length]).join(' ') + '\n';
  const cases = [
    [minified, minified.replace('v800=f(800,', 'v800=f(801,'), ['800', '801'], ['0', '1']],
    [prose, prose.slice(0, 15000) + prose.slice(15000).replace(' the ', ' a '), ['the', 'a'], ['the', 'a']],
  ];
  for (const [left, right, wordEdit, charEdit] of cases) {
    for (const mode of ['lines', 'words', 'chars']) {
      const result = compare(left, right, { mode });
      const [before, after] = mode === 'chars' ? charEdit : wordEdit;
      assert.equal(result.rows.length, 1, mode);
      assert.deepEqual(highlights(result.rows[0].left), [before], mode);
      assert.deepEqual(highlights(result.rows[0].right), [after], mode);
      assert.ok(result.stats.similarity > 99.9, `${mode}: ${result.stats.similarity}`);
      assert.equal(result.coarse, 0, mode);
    }
  }
});

test('long unrelated texts stop searching at the budget, say so and still rebuild both texts', () => {
  const left = randomText(1, 60000);
  const right = randomText(2, 60000);
  const start = performance.now();
  const result = compare(left, right, { mode: 'chars' });
  assert.ok(performance.now() - start < 3000, 'the search budget bounds the time');
  assert.equal(result.coarse, 1);
  const text = (side) => result.rows.map((row) => row[side].parts.map((p) => p.text).join('')).join('');
  assert.equal(text('left'), left);
  assert.equal(text('right'), right);
  assert.equal(applyEdits(left, result.script), right);
});

test('the edit script rebuilds the new text in every mode', () => {
  const left = 'one two three\nfour\nfive six\n';
  const right = 'one 2 three\nfive six seven\neight';
  for (const mode of ['lines', 'words', 'chars']) {
    assert.equal(applyEdits(left, compare(left, right, { mode }).script), right, mode);
  }
});

test('unified output follows the context option', () => {
  const left = 'a\nb\nc\nd\ne\nf\ng\n';
  const right = 'a\nb\nc\nD\ne\nf\ng\n';
  assert.equal(compare(left, right, { context: 1 }).unified, '--- a\n+++ b\n@@ -3,3 +3,3 @@\n c\n-d\n+D\n e\n');
  assert.equal(compare(left, right, { context: 0 }).unified, '--- a\n+++ b\n@@ -4 +4 @@\n-d\n+D\n');
});
