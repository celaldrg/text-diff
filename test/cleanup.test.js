import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupSemantic } from '../src/cleanup.js';
import { applyEdits, diffText, toEdits } from '../src/diff.js';

/** Diffs, cleans up and checks that the cleaned script still rebuilds b. */
function cleaned(a, b, mode) {
  const diff = diffText(a, b, { mode });
  const edits = toEdits(diff, cleanupSemantic(diff));
  assert.equal(applyEdits(a, edits), b);
  return edits;
}

const eq = (text) => ({ type: 'equal', text });
const del = (text) => ({ type: 'delete', text });
const ins = (text) => ({ type: 'insert', text });

test('tiny equalities between edits are merged', () => {
  const diff = diffText('mouse', 'sofas', { mode: 'chars' });
  assert.ok(diff.runs.length > 2, 'the minimal script is fragmented');
  assert.deepEqual(cleaned('mouse', 'sofas', 'chars'), [del('mouse'), ins('sofas')]);
});

test('equalities longer than their neighbours stay', () => {
  assert.deepEqual(cleaned('abcdefgh', 'abXdeYgh', 'chars'), [
    eq('ab'),
    del('c'),
    ins('X'),
    eq('de'),
    del('f'),
    ins('Y'),
    eq('gh'),
  ]);
});

test('a lone edit slides to a word boundary', () => {
  const raw = toEdits(diffText('foo bar baz', 'foo baz', { mode: 'chars' }));
  assert.deepEqual(raw, [eq('foo ba'), del('r ba'), eq('z')]);
  assert.deepEqual(cleaned('foo bar baz', 'foo baz', 'chars'), [eq('foo '), del('bar '), eq('baz')]);
});

test('merged edits give back their common prefix and suffix', () => {
  const a = '  rest(10);\n  return fry(sugar);\n';
  const b = '  rest(15);\n  const butter = 1; // spoon\n  return fry(butter);\n';
  assert.deepEqual(cleaned(a, b, 'chars'), [
    eq('  rest(1'),
    del('0'),
    ins('5'),
    eq(');\n'),
    ins('  const butter = 1; // spoon\n'),
    eq('  return fry('),
    del('suga'),
    ins('butte'),
    eq('r);\n'),
  ]);
});

test('word edits keep the space before a replaced word', () => {
  assert.deepEqual(cleaned('The quick brown fox jumps.', 'The quick red fox jumps.', 'words'), [
    eq('The quick '),
    del('brown'),
    ins('red'),
    eq(' fox jumps.'),
  ]);
});

test('spaces do not tie unrelated words together', () => {
  const a = '  const milk = 300; // millilitres\n  const sugar = 2; // spoons\n';
  const b = '  const milk = 150 * people; // millilitres\n';
  assert.deepEqual(cleaned(a, b, 'words'), [
    eq('  const milk = '),
    del('300'),
    ins('150 * people'),
    eq('; // millilitres\n'),
    del('  const sugar = 2; // spoons\n'),
  ]);
});

test('clean scripts are left alone', () => {
  assert.deepEqual(cleaned('color', 'colour', 'chars'), [eq('colo'), ins('u'), eq('r')]);
  assert.deepEqual(cleaned('', '', 'chars'), []);
  assert.deepEqual(cleaned('same', 'same', 'words'), [eq('same')]);
});
