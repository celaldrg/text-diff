import test from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../src/compare.js';
import { applyPatch, unifiedDiff } from '../src/unified.js';

const NO_CHANGES = { added: 0, removed: 0, changed: 0 };
const counts = ({ added, removed, changed }) => ({ added, removed, changed });
const changedTexts = (side) => side.parts.filter((p) => p.changed).map((p) => p.text);

test('ignore whitespace: spacing differences are not changes', () => {
  const left = 'a  b\n\tc\nd \n';
  const right = ' a b \nc\nd\n';
  const result = compare(left, right, { ignoreWhitespace: true });
  assert.deepEqual(counts(result.stats), NO_CHANGES);
  assert.equal(result.unified, '');
  assert.deepEqual(
    result.rows.map((row) => row.kind),
    ['equal', 'equal', 'equal'],
  );
  assert.deepEqual(counts(compare(left, right).stats), { added: 0, removed: 0, changed: 3 });
});

test('ignore whitespace still sees words that differ', () => {
  for (const mode of ['lines', 'words']) {
    const [row] = compare('one  two three\n', 'one two four\n', { mode, ignoreWhitespace: true }).rows;
    assert.deepEqual(changedTexts(row.left), ['three'], mode);
    assert.deepEqual(changedTexts(row.right), ['four'], mode);
  }
  assert.deepEqual(counts(compare('a b\n', 'ab\n', { ignoreWhitespace: true }).stats), {
    added: 0,
    removed: 0,
    changed: 1,
  });
});

test('ignore whitespace: unified context comes from the old text', () => {
  assert.equal(
    unifiedDiff('a b\nx\n', 'a  b\ny\n', { ignoreWhitespace: true }),
    '--- a\n+++ b\n@@ -1,2 +1,2 @@\n a b\n-x\n+y\n',
  );
});

test('ignore whitespace: a missing final line break never joins lines', () => {
  assert.equal(unifiedDiff('x\ny', 'x\ny\n', { ignoreWhitespace: true }), '');
  const patch = unifiedDiff('x\ny', 'x\ny\nz\n', { ignoreWhitespace: true });
  assert.equal(patch, '--- a\n+++ b\n@@ -1,2 +1,3 @@\n x\n-y\n\\ No newline at end of file\n+y\n+z\n');
  assert.deepEqual(applyPatch('x\ny', patch), { ok: true, text: 'x\ny\nz\n' });
  assert.equal(
    unifiedDiff('x\ny', 'x\ny\nz\ny \n', { ignoreWhitespace: true }),
    '--- a\n+++ b\n@@ -1,2 +1,4 @@\n x\n+y\n+z\n y\n\\ No newline at end of file\n',
  );
  assert.equal(unifiedDiff('z\nw', 'z\n', { ignoreWhitespace: true }), '--- a\n+++ b\n@@ -1,2 +1 @@\n z\n-w\n\\ No newline at end of file\n');
});

test('ignore case: letter case is not a change, Turkish i included', () => {
  assert.deepEqual(counts(compare('Hello World\n', 'hello world\n', { ignoreCase: true }).stats), NO_CHANGES);
  const turkish = compare('İSTANBUL\nIRMAK\n', 'istanbul\nırmak\n', { ignoreCase: true });
  assert.deepEqual(counts(turkish.stats), NO_CHANGES);
  assert.equal(turkish.unified, '');
  assert.deepEqual(counts(compare('Hello\n', 'hello\n').stats), { added: 0, removed: 0, changed: 1 });
});

test('ignore case in words mode highlights only real changes', () => {
  const [row] = compare('The Cat sat\n', 'the cat stood\n', { mode: 'words', ignoreCase: true }).rows;
  assert.deepEqual(changedTexts(row.left), ['sat']);
  assert.deepEqual(changedTexts(row.right), ['stood']);
});

test('ignore blank lines: blank-only changes are kept apart', () => {
  const left = 'x\n\ny\nz\n';
  const right = 'x\ny\nz\n\n\n';
  const result = compare(left, right, { ignoreBlankLines: true });
  assert.deepEqual(result.stats, { added: 0, removed: 0, changed: 0, similarity: 100 });
  assert.deepEqual(result.changes, []);
  assert.equal(result.unified, '');
  assert.deepEqual(
    result.rows.map((row) => [row.kind, row.left?.num ?? null, row.right?.num ?? null]),
    [
      ['equal', 1, 1],
      ['ignored', 2, null],
      ['equal', 3, 2],
      ['equal', 4, 3],
      ['ignored', null, 4],
      ['ignored', null, 5],
    ],
  );
  assert.deepEqual(counts(compare(left, right).stats), { added: 2, removed: 1, changed: 0 });
});

test('ignore blank lines: blank lines never pull a line out of its place', () => {
  const left = 'a\n\n\nb\n';
  const right = 'a\nb\n\n';
  const result = compare(left, right, { ignoreBlankLines: true });
  assert.deepEqual(result.stats, { added: 0, removed: 0, changed: 0, similarity: 100 });
  assert.equal(result.unified, '');
  assert.deepEqual(
    result.rows.map((row) => [row.kind, row.left?.num ?? null, row.right?.num ?? null]),
    [
      ['equal', 1, 1],
      ['ignored', 2, null],
      ['ignored', 3, null],
      ['equal', 4, 2],
      ['ignored', null, 3],
    ],
  );
  assert.deepEqual(counts(compare(left, right).stats), { added: 0, removed: 1, changed: 1 });
});

test('ignore blank lines: whitespace-only lines are blank, mixed changes are not', () => {
  assert.deepEqual(counts(compare('x\n  \t\ny\n', 'x\ny\n', { ignoreBlankLines: true }).stats), NO_CHANGES);
  const mixed = compare('x\n\ny\n', 'x\nz\ny\n', { ignoreBlankLines: true });
  assert.deepEqual(counts(mixed.stats), { added: 0, removed: 0, changed: 1 });
  assert.equal(mixed.changes.length, 1);
});

const BLANK_OLD = 'one\ntwo\nthree\nfour\nfive\n\nsix\nseven\neight\nnine\nten\neleven\ntwelve\nthirteen\nfourteen\nfifteen\nsixteen\n';
const BLANK_NEW = 'one\nTWO\nthree\nfour\nfive\nsix\nseven\n\neight\nnine\nten\neleven\nTWELVE\nthirteen\nfourteen\n\n\nfifteen\nsixteen\n';

test('ignore blank lines: unified output matches GNU diff -U2 -B', () => {
  const expected = [
    '--- a',
    '+++ b',
    '@@ -1,4 +1,4 @@',
    ' one',
    '-two',
    '+TWO',
    ' three',
    ' four',
    '@@ -7,9 +6,10 @@',
    ' six',
    ' seven',
    '+',
    ' eight',
    ' nine',
    ' ten',
    ' eleven',
    '-twelve',
    '+TWELVE',
    ' thirteen',
    ' fourteen',
  ];
  assert.equal(unifiedDiff(BLANK_OLD, BLANK_NEW, { context: 2, ignoreBlankLines: true }), expected.join('\n') + '\n');
});

test('ignore blank lines: hunks never overlap where GNU diff would overlap them', () => {
  const patch = unifiedDiff(BLANK_NEW, BLANK_OLD, { context: 3, ignoreBlankLines: true });
  const headers = patch.split('\n').filter((line) => line.startsWith('@@'));
  assert.deepEqual(headers, ['@@ -1,19 +1,17 @@']);
});
