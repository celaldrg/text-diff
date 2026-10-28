import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, parseUnified, unifiedDiff } from '../src/unified.js';

const OLD = 'apple\nbanana\ncherry\ndate\nelderberry\nfig\ngrape\nhoneydew\nkiwi\nlemon\nmango\nnectarine\norange\npapaya\nquince\n';
const NEW =
  'apricot\nbanana\ncherry\ndate\nelderberry\nfig\ngrape\nhoneydew\nkiwi\nlime\nmango\nnectarine\norange\npeach\npear\nquince\nraspberry\n';

/** Expected output, checked against GNU diff 3.12 ("diff -u --label a --label b"). */
const PATCH_U3 = [
  '--- a',
  '+++ b',
  '@@ -1,4 +1,4 @@',
  '-apple',
  '+apricot',
  ' banana',
  ' cherry',
  ' date',
  '@@ -7,9 +7,11 @@',
  ' grape',
  ' honeydew',
  ' kiwi',
  '-lemon',
  '+lime',
  ' mango',
  ' nectarine',
  ' orange',
  '-papaya',
  '+peach',
  '+pear',
  ' quince',
  '+raspberry',
  '',
].join('\n');

const PATCH_U1 = [
  '--- a',
  '+++ b',
  '@@ -1,2 +1,2 @@',
  '-apple',
  '+apricot',
  ' banana',
  '@@ -9,3 +9,3 @@',
  ' kiwi',
  '-lemon',
  '+lime',
  ' mango',
  '@@ -13,3 +13,5 @@',
  ' orange',
  '-papaya',
  '+peach',
  '+pear',
  ' quince',
  '+raspberry',
  '',
].join('\n');

const PATCH_U0 = [
  '--- a',
  '+++ b',
  '@@ -1 +1 @@',
  '-apple',
  '+apricot',
  '@@ -10 +10 @@',
  '-lemon',
  '+lime',
  '@@ -14 +14,2 @@',
  '-papaya',
  '+peach',
  '+pear',
  '@@ -15,0 +17 @@',
  '+raspberry',
  '',
].join('\n');

test('unified output matches diff -u for a hand-made example', () => {
  assert.equal(unifiedDiff(OLD, NEW), PATCH_U3);
  assert.equal(unifiedDiff(OLD, NEW, { context: 1 }), PATCH_U1);
  assert.equal(unifiedDiff(OLD, NEW, { context: 0 }), PATCH_U0);
});

test('identical texts give an empty diff', () => {
  assert.equal(unifiedDiff(OLD, OLD), '');
  assert.equal(unifiedDiff('', ''), '');
});

test('a missing final line break is marked like diff -u', () => {
  assert.equal(
    unifiedDiff('a\nb\nc', 'a\nb\nc\n'),
    '--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n b\n-c\n\\ No newline at end of file\n+c\n',
  );
  assert.equal(
    unifiedDiff('a\nb\nc\n', 'a\nb\nc'),
    '--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n b\n-c\n+c\n\\ No newline at end of file\n',
  );
});

test('empty files use zero-length ranges', () => {
  assert.equal(unifiedDiff('', 'x\ny\n'), '--- a\n+++ b\n@@ -0,0 +1,2 @@\n+x\n+y\n');
  assert.equal(unifiedDiff('x\ny\n', ''), '--- a\n+++ b\n@@ -1,2 +0,0 @@\n-x\n-y\n');
});

test('file names can be set', () => {
  assert.ok(unifiedDiff('x\n', 'y\n', { oldName: 'old.txt', newName: 'new.txt' }).startsWith('--- old.txt\n+++ new.txt\n'));
});

test('parse reads names, ranges and lines', () => {
  const parsed = parseUnified(PATCH_U3);
  assert.equal(parsed.ok, true);
  const { patch } = parsed;
  assert.equal(patch.oldName, 'a');
  assert.equal(patch.newName, 'b');
  assert.equal(patch.hunks.length, 2);
  const [first, second] = patch.hunks;
  assert.deepEqual(
    { oldStart: first.oldStart, oldLines: first.oldLines, newStart: first.newStart, newLines: first.newLines, line: first.line },
    { oldStart: 1, oldLines: 4, newStart: 1, newLines: 4, line: 3 },
  );
  assert.deepEqual(first.lines.slice(0, 3), [
    { op: '-', text: 'apple', newline: true },
    { op: '+', text: 'apricot', newline: true },
    { op: ' ', text: 'banana', newline: true },
  ]);
  assert.equal(second.line, 9);
  assert.equal(second.lines.length, 13);
});

test('parse understands git headers, timestamps, short ranges and missing line breaks', () => {
  const text = [
    'diff --git a/f.txt b/f.txt',
    'index 83db48f..bf269f4 100644',
    '--- a/f.txt\t2026-10-28 10:00:00',
    '+++ b/f.txt\t2026-10-28 10:05:00',
    '@@ -3 +3,2 @@',
    '-old',
    '\\ No newline at end of file',
    '+new',
    '+line',
    '',
  ].join('\n');
  const { ok, patch } = parseUnified(text);
  assert.equal(ok, true);
  assert.equal(patch.oldName, 'a/f.txt');
  assert.equal(patch.newName, 'b/f.txt');
  assert.equal(patch.hunks[0].oldLines, 1);
  assert.deepEqual(patch.hunks[0].lines[0], { op: '-', text: 'old', newline: false });
});

test('a patch with Windows line breaks has clean names and applies to a Windows text', () => {
  const crlf = (text) => text.replaceAll('\n', '\r\n');
  const named = PATCH_U3.replace('--- a', '--- old.txt').replace('+++ b', '+++ new.txt\t2026-10-28 10:05:00');
  const { ok, patch } = parseUnified(crlf(named));
  assert.equal(ok, true);
  assert.equal(patch.oldName, 'old.txt');
  assert.equal(patch.newName, 'new.txt');
  assert.deepEqual(applyPatch(crlf(OLD), patch), { ok: true, text: crlf(NEW) });
});

test('parse reports errors with their line', () => {
  const cases = [
    ['nothing to see\n', 'no-hunks', 1],
    ['--- a\n+++ b\n@@ -1,x +1 @@\n', 'bad-header', 3],
    ['@@ -1,3 +1,3 @@\n a\n b\n', 'truncated', 3],
    ['@@ -1 +1,2 @@\n x\n-y\n+z\n', 'too-many-lines', 3],
    ['@@ -1,2 +1,2 @@\n x\n*y\n', 'bad-line', 3],
    ['@@ -1 +1 @@\n\\ No newline at end of file\n-x\n+y\n', 'bad-line', 2],
    ['@@ -1 +1 @@\n-x\n+y\n+z\n', 'bad-line', 4],
    ['--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y\n--- c\n+++ d\n@@ -1 +1 @@\n-p\n+q\n', 'multiple-files', 6],
  ];
  for (const [text, error, line] of cases) {
    assert.deepEqual(parseUnified(text), { ok: false, error, line }, JSON.stringify(text));
  }
});

test('parse(unified) applied to A gives B', () => {
  for (const patch of [PATCH_U3, PATCH_U1, PATCH_U0]) {
    const parsed = parseUnified(patch);
    assert.equal(parsed.ok, true);
    assert.deepEqual(applyPatch(OLD, parsed.patch), { ok: true, text: NEW });
    assert.deepEqual(applyPatch(OLD, patch), { ok: true, text: NEW });
  }
});

test('a changed file reports the first hunk that does not apply', () => {
  const late = OLD.replace('nectarine', 'NECTARINE');
  assert.deepEqual(applyPatch(late, PATCH_U3), { ok: false, error: 'hunk-failed', line: 9, hunk: 1 });
  const early = OLD.replace('cherry', 'CHERRY');
  assert.deepEqual(applyPatch(early, PATCH_U3), { ok: false, error: 'hunk-failed', line: 3, hunk: 0 });
  assert.deepEqual(applyPatch('', PATCH_U3), { ok: false, error: 'hunk-failed', line: 3, hunk: 0 });
});

test('hunks are found when lines moved', () => {
  assert.deepEqual(applyPatch(`zero\nzero again\n${OLD}`, PATCH_U3), { ok: true, text: `zero\nzero again\n${NEW}` });
  const shorter = OLD.replace('elderberry\nfig\n', '');
  assert.deepEqual(applyPatch(shorter, PATCH_U3), { ok: true, text: NEW.replace('elderberry\nfig\n', '') });
});

test('parse errors pass through apply', () => {
  assert.deepEqual(applyPatch(OLD, 'not a patch'), { ok: false, error: 'no-hunks', line: 1 });
});

test('edge cases round trip', () => {
  const pairs = [
    ['', 'x\ny\n'],
    ['x\ny\n', ''],
    ['a\nb\nc', 'a\nb\nc\n'],
    ['a\nb\nc\n', 'a\nb\nc'],
    ['a\r\nb\r\n', 'a\r\nc\r\n'],
    ['one', 'two'],
    ['\n\n\n', '\n'],
    ['\\ tricky\n- dash\n+ plus\n', '\\ tricky\n+ plus\n- dash\n'],
  ];
  for (const [a, b] of pairs) {
    for (const context of [0, 3]) {
      assert.deepEqual(applyPatch(a, unifiedDiff(a, b, { context })), { ok: true, text: b }, JSON.stringify([a, b]));
    }
  }
});
