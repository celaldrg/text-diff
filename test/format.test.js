import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EOL_MARK,
  changeExtents,
  hunkLines,
  lineSegments,
  looksBinary,
  patchFileName,
  patchLineKinds,
} from '../src/format.js';
import { compare } from '../src/compare.js';
import { parseUnified } from '../src/unified.js';

test('unchanged line breaks are hidden, changed ones become a marker', () => {
  assert.deepEqual(
    lineSegments([
      { text: 'one ', changed: false },
      { text: 'two', changed: true },
      { text: '\n', changed: false },
    ]),
    [
      { text: 'one ', changed: false, eol: false },
      { text: 'two', changed: true, eol: false },
    ],
  );
  assert.deepEqual(lineSegments([{ text: 'x', changed: false }, { text: '\r\n', changed: true }]), [
    { text: 'x', changed: false, eol: false },
    { text: EOL_MARK, changed: true, eol: true },
  ]);
  assert.deepEqual(lineSegments([]), []);
});

test('a change covers its rows up to the next unchanged or ignored row', () => {
  const rows = ['equal', 'change', 'delete', 'equal', 'insert', 'ignored', 'delete'].map((kind) => ({ kind }));
  assert.deepEqual(changeExtents(rows, [1, 4, 6]), [
    [1, 3],
    [4, 5],
    [6, 7],
  ]);
  assert.deepEqual(changeExtents(rows, []), []);
});

test('change extents match the rows a comparison marks as changed', () => {
  const result = compare('a\nb\nc\nd\ne\n', 'a\nB\nc\nd\nE\nf\n');
  for (const [rows, key] of [
    [result.rows, 'row'],
    [result.inline, 'inline'],
  ]) {
    const extents = changeExtents(
      rows,
      result.changes.map((change) => change[key]),
    );
    const covered = new Set(extents.flatMap(([start, end]) => Array.from({ length: end - start }, (_, i) => start + i)));
    rows.forEach((row, index) => assert.equal(covered.has(index), row.kind !== 'equal', `${key} row ${index}`));
  }
});

test('patch lines are classified for colouring', () => {
  const lines = [
    'diff -u a.txt b.txt',
    '--- a.txt',
    '+++ b.txt',
    '@@ -1,3 +1,3 @@',
    ' same',
    '-old',
    '+new',
    '--- not a header inside a hunk',
    '\\ No newline at end of file',
    '@@ -9 +9 @@',
    '+++ added line',
  ];
  assert.deepEqual(patchLineKinds(lines), [
    'meta',
    'file',
    'file',
    'hunk',
    'context',
    'del',
    'add',
    'del',
    'note',
    'hunk',
    'add',
  ]);
});

test('a failing hunk is shown as it reads in the patch', () => {
  const patch = [
    '--- a',
    '+++ b',
    '@@ -1,2 +1,2 @@',
    ' keep',
    '-old',
    '\\ No newline at end of file',
    '+new',
    '\\ No newline at end of file',
    '',
  ].join('\n');
  const parsed = parseUnified(patch);
  assert.equal(parsed.ok, true);
  assert.deepEqual(hunkLines(patch, parsed.patch.hunks[0]), [
    '@@ -1,2 +1,2 @@',
    ' keep',
    '-old',
    '\\ No newline at end of file',
    '+new',
    '\\ No newline at end of file',
  ]);
});

test('hunk lines drop the carriage returns of a CRLF patch', () => {
  const patch = '--- a\r\n+++ b\r\n@@ -1 +1 @@ note\r\n-x\r\n+y\r\n';
  const parsed = parseUnified(patch);
  assert.equal(parsed.ok, true);
  assert.deepEqual(hunkLines(patch, parsed.patch.hunks[0]), ['@@ -1 +1 @@ note', '-x', '+y']);
});

test('downloaded patches are named after the original file', () => {
  assert.equal(patchFileName('notes.txt'), 'notes.diff');
  assert.equal(patchFileName('archive.tar.gz'), 'archive.tar.diff');
  assert.equal(patchFileName('README'), 'README.diff');
  assert.equal(patchFileName('.bashrc'), '.bashrc.diff');
  assert.equal(patchFileName(''), 'changes.diff');
  assert.equal(patchFileName('  .txt'), 'changes.diff');
  assert.equal(patchFileName(), 'changes.diff');
});

test('binary text is recognised by its NUL characters', () => {
  assert.equal(looksBinary('plain text\nwith lines'), false);
  assert.equal(looksBinary('PNG\0\0\0'), true);
  assert.equal(looksBinary(''), false);
});
