import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupSemantic } from '../src/cleanup.js';
import { compare } from '../src/compare.js';
import { applyEdits, diffText, editDistance, toEdits } from '../src/diff.js';
import { diffSequences, diffWithBudget } from '../src/myers.js';
import { MODES, keyFunction, splitLines, tokenize } from '../src/tokens.js';
import { applyPatch, parseUnified, unifiedDiff } from '../src/unified.js';

/** Small seeded PRNG (mulberry32), so every run sees the same cases. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const int = (rng, max) => Math.floor(rng() * (max + 1));

const LINES = [
  '',
  'alpha',
  'beta gamma',
  '  indented line',
  '\tTabbed\tline',
  'trailing space  ',
  'İstanbul ılık',
  'Çağlar ŞİŞLİ',
  'éclair',
  'emoji 😀 here',
  'x = y + 1;',
  'return (a, b);',
  '   ',
  'ALPHA',
  'Beta  Gamma',
  'mixed\rcarriage',
];
const CHARS = ['a', 'b', 'c', ' ', '  ', '\t', '\n', '\r\n', 'İ', 'ı', 'é', '́', '😀', ',', '.', '\r', 'X'];

/** A random multi-line text with mixed line breaks, sometimes without a final one. */
function randomText(rng) {
  const count = int(rng, 8);
  let text = '';
  for (let i = 0; i < count; i++) text += pick(rng, LINES) + (rng() < 0.2 ? '\r\n' : '\n');
  return rng() < 0.3 ? text.replace(/\r?\n$/, '') : text;
}

/** Edits some characters of a line. */
function editChars(rng, line) {
  const chars = Array.from(line);
  for (let e = 1 + int(rng, 2); e > 0; e--) {
    const at = int(rng, chars.length);
    const r = rng();
    if (r < 0.4) chars.splice(at, 0, pick(rng, CHARS));
    else if (r < 0.7) chars.splice(at, 1);
    else chars[at] = pick(rng, CHARS);
  }
  return chars.join('');
}

/** A text derived from `text` by deleting, replacing, inserting and editing lines. */
function mutate(rng, text) {
  if (rng() < 0.1) return randomText(rng);
  const out = [];
  for (const line of splitLines(text)) {
    const r = rng();
    if (r < 0.12) continue;
    if (r < 0.24) {
      out.push(`${pick(rng, LINES)}\n`);
      continue;
    }
    if (r < 0.34) out.push(`${pick(rng, LINES)}\n`);
    out.push(r < 0.46 ? editChars(rng, line) : line);
  }
  if (rng() < 0.2) out.push(pick(rng, LINES));
  return out.join('');
}

/** A pair of texts: usually related, sometimes unrelated. */
function randomPair(rng) {
  const a = randomText(rng);
  return [a, rng() < 0.85 ? mutate(rng, a) : randomText(rng)];
}

/** Reference: length of the longest common subsequence, O(NM) dynamic programming. */
function lcsLength(a, b) {
  let prev = new Int32Array(b.length + 1);
  let cur = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Checks that runs cover both sequences in order and that equal runs match. */
function assertValidRuns(a, b, runs) {
  let i = 0;
  let j = 0;
  for (const run of runs) {
    assert.ok(run.count > 0);
    assert.equal(run.aStart, i);
    assert.equal(run.bStart, j);
    if (run.type !== 'insert') i += run.count;
    if (run.type !== 'delete') j += run.count;
    if (run.type === 'equal') {
      for (let t = 1; t <= run.count; t++) assert.equal(a[i - t], b[j - t]);
    }
  }
  assert.equal(i, a.length);
  assert.equal(j, b.length);
}

test('Myers is minimal: 300 seeded random short pairs match the O(NM) LCS reference', () => {
  const rng = mulberry32(300);
  for (let n = 0; n < 300; n++) {
    const alphabet = 1 + int(rng, 4);
    const a = Array.from({ length: int(rng, 40) }, () => int(rng, alphabet));
    const b = rng() < 0.5 ? a.filter(() => rng() < 0.8).concat([int(rng, alphabet)]) : Array.from({ length: int(rng, 40) }, () => int(rng, alphabet));
    const runs = diffSequences(a, b);
    assertValidRuns(a, b, runs);
    assert.equal(editDistance(runs), a.length + b.length - 2 * lcsLength(a, b), `pair ${n}`);
  }
});

test('any search budget gives a valid script (300 seeded pairs)', () => {
  const rng = mulberry32(302);
  let spent = 0;
  for (let n = 0; n < 300; n++) {
    const alphabet = 1 + int(rng, 6);
    const a = Array.from({ length: int(rng, 400) }, () => int(rng, alphabet));
    const b =
      rng() < 0.5
        ? a.map((value) => (rng() < 0.1 ? int(rng, alphabet) : value))
        : Array.from({ length: int(rng, 400) }, () => int(rng, alphabet));
    const { runs, complete } = diffWithBudget(a, b, int(rng, 4000));
    assertValidRuns(a, b, runs);
    if (!complete) spent++;
  }
  assert.ok(spent > 0 && spent < 300, `the budget ran out ${spent} times: both cases are covered`);
});

test('text diffs are minimal in every mode (300 seeded pairs)', () => {
  const rng = mulberry32(301);
  for (let n = 0; n < 300; n++) {
    const mode = MODES[n % 3];
    const [a, b] = randomPair(rng);
    const options = { mode, ignoreCase: rng() < 0.3, ignoreWhitespace: rng() < 0.3 };
    const diff = diffText(a, b, options);
    assertValidRuns(diff.aKeys, diff.bKeys, diff.runs);
    const lcs = lcsLength(diff.aKeys, diff.bKeys);
    assert.equal(editDistance(diff.runs), diff.aKeys.length + diff.bKeys.length - 2 * lcs, `pair ${n} (${mode})`);
  }
});

for (const [index, mode] of MODES.entries()) {
  test(`edit scripts turn A into B in ${mode} mode (500 seeded pairs)`, () => {
    const rng = mulberry32(500 + index);
    for (let n = 0; n < 500; n++) {
      const [a, b] = randomPair(rng);
      const diff = diffText(a, b, { mode });
      assert.equal(applyEdits(a, toEdits(diff)), b, `raw script, pair ${n}`);
      assert.equal(applyEdits(a, toEdits(diff, cleanupSemantic(diff))), b, `cleaned script, pair ${n}`);
      assert.equal(applyEdits(a, compare(a, b, { mode }).script), b, `compare script, pair ${n}`);
    }
  });
}

test('tokenizers are lossless', () => {
  const rng = mulberry32(7);
  for (let n = 0; n < 300; n++) {
    const text = mutate(rng, randomText(rng));
    for (const mode of MODES) assert.equal(tokenize(text, mode).join(''), text);
  }
});

test('compare rows rebuild both texts under any options', () => {
  const rng = mulberry32(8);
  const join = (sides) => sides.map((side) => side.parts.map((p) => p.text).join('')).join('');
  for (let n = 0; n < 300; n++) {
    const [a, b] = randomPair(rng);
    const options = {
      mode: pick(rng, MODES),
      ignoreWhitespace: rng() < 0.3,
      ignoreCase: rng() < 0.3,
      ignoreBlankLines: rng() < 0.3,
      context: int(rng, 4),
    };
    const result = compare(a, b, options);
    const left = result.rows.filter((row) => row.left).map((row) => row.left);
    const right = result.rows.filter((row) => row.right).map((row) => row.right);
    assert.equal(join(left), a);
    assert.equal(join(right), b);
    assert.deepEqual(
      left.map((side) => side.num),
      splitLines(a).map((_, i) => i + 1),
    );
    assert.deepEqual(
      right.map((side) => side.num),
      splitLines(b).map((_, i) => i + 1),
    );
    const inlineOld = result.inline.filter((row) => row.aNum !== null);
    assert.equal(inlineOld.map((row) => row.parts.map((p) => p.text).join('')).join(''), a);
    assert.deepEqual(
      inlineOld.map((row) => row.aNum),
      splitLines(a).map((_, i) => i + 1),
    );
    for (const { row, inline } of result.changes) {
      assert.ok(['change', 'delete', 'insert'].includes(result.rows[row].kind));
      assert.ok(['delete', 'insert'].includes(result.inline[inline].kind));
    }
    const { similarity } = result.stats;
    assert.ok(similarity >= 0 && similarity <= 100);
    if (a === b) assert.deepEqual(result.stats, { added: 0, removed: 0, changed: 0, similarity: 100 });
  }
});

test('parse(unified) applied to A gives B (300 seeded pairs, contexts 0 to 4)', () => {
  const rng = mulberry32(9);
  for (let n = 0; n < 300; n++) {
    const [a, b] = randomPair(rng);
    const patch = unifiedDiff(a, b, { context: int(rng, 4) });
    if (a === b) {
      assert.equal(patch, '');
      continue;
    }
    const parsed = parseUnified(patch);
    assert.equal(parsed.ok, true, `pair ${n}`);
    assert.deepEqual(applyPatch(a, parsed.patch), { ok: true, text: b }, `pair ${n}`);
  }
});

test('patches made with ignore options still apply and keep what was not ignored', () => {
  const rng = mulberry32(10);
  const nonBlank = (text) => splitLines(text).filter((line) => line.trim() !== '');
  for (let n = 0; n < 300; n++) {
    const [a, b] = randomPair(rng);
    const context = int(rng, 4);
    const blank = unifiedDiff(a, b, { context, ignoreBlankLines: true });
    const blankText = blank === '' ? a : applyPatch(a, blank).text;
    assert.deepEqual(nonBlank(blankText), nonBlank(b), `blank lines, pair ${n}`);
    const options = { context, ignoreWhitespace: rng() < 0.5, ignoreCase: rng() < 0.5 };
    const loose = unifiedDiff(a, b, options);
    const looseText = loose === '' ? a : applyPatch(a, loose).text;
    const key = keyFunction('lines', options);
    assert.deepEqual(splitLines(looseText).map(key), splitLines(b).map(key), `whitespace/case, pair ${n}`);
  }
});

const BLANKS = ['\n', '  \n', '\t\r\n', '\r\n'];

/** A text of a few repeated words and many blank lines, which blank lines can align in many ways. */
function blankyText(rng) {
  let text = '';
  for (let i = int(rng, 12); i > 0; i--) text += pick(rng, ['a', 'b', 'c', '', '  ']) + (rng() < 0.2 ? '\r\n' : '\n');
  return rng() < 0.3 ? text.replace(/\r?\n$/, '') : text;
}

/**
 * A copy of `text` that differs only in blank lines: they are dropped,
 * swapped for other blank lines and added, but never after a last line
 * without a line break (that would change the line itself).
 */
function reblank(rng, text) {
  const out = [];
  const addBlanks = () => {
    while (rng() < 0.5) out.push(pick(rng, BLANKS));
  };
  for (const line of splitLines(text)) {
    addBlanks();
    const r = rng();
    if (line.trim() !== '') out.push(line);
    else if (r >= 0.3) out.push(r < 0.5 ? pick(rng, BLANKS) : line);
  }
  const last = out[out.length - 1];
  if (last === undefined || last.endsWith('\n')) addBlanks();
  return out.join('');
}

test('ignore blank lines: texts that differ only in blank lines show no changes (400 seeded pairs)', () => {
  const rng = mulberry32(11);
  for (let n = 0; n < 400; n++) {
    const a = rng() < 0.75 ? blankyText(rng) : randomText(rng);
    const b = reblank(rng, a);
    const options = {
      mode: pick(rng, MODES),
      ignoreBlankLines: true,
      ignoreWhitespace: rng() < 0.3,
      ignoreCase: rng() < 0.3,
      context: int(rng, 4),
    };
    const result = compare(a, b, options);
    const label = `pair ${n}: ${JSON.stringify([a, b])}`;
    assert.deepEqual(result.stats, { added: 0, removed: 0, changed: 0, similarity: 100 }, label);
    assert.deepEqual(result.changes, [], label);
    assert.equal(result.unified, '', label);
  }
});

test('ignore blank lines: the non-blank lines are still aligned minimally (300 seeded pairs)', () => {
  const rng = mulberry32(12);
  const nonBlankKeys = (lines, keys) => keys.filter((_, i) => lines[i].trim() !== '');
  for (let n = 0; n < 300; n++) {
    const [a, b] = rng() < 0.5 ? randomPair(rng) : [blankyText(rng), blankyText(rng)];
    const diff = diffText(a, b, { ignoreBlankLines: true, ignoreWhitespace: rng() < 0.3, ignoreCase: rng() < 0.3 });
    assertValidRuns(diff.aKeys, diff.bKeys, diff.runs);
    let matched = 0;
    for (const run of diff.runs) {
      if (run.type !== 'equal') continue;
      for (let i = run.aStart; i < run.aStart + run.count; i++) if (diff.aTokens[i].trim() !== '') matched++;
    }
    const lcs = lcsLength(nonBlankKeys(diff.aTokens, diff.aKeys), nonBlankKeys(diff.bTokens, diff.bKeys));
    assert.equal(matched, lcs, `pair ${n}: ${JSON.stringify([a, b])}`);
  }
});

/** 5,000 lines of code-like text and a copy with 200 scattered edits. */
function bigPair() {
  const rng = mulberry32(5000);
  const words = ['alpha', 'beta', 'gamma', 'delta', 'if', 'return', '(', ')', '{', '}', '=', 'x', 'count', '+', '42', ';'];
  const line = () => {
    const parts = Array.from({ length: 1 + int(rng, 9) }, () => pick(rng, words));
    return '  '.repeat(int(rng, 2)) + parts.join(' ');
  };
  const oldLines = Array.from({ length: 5000 }, line);
  const newLines = oldLines.slice();
  for (let e = 0; e < 200; e++) {
    const at = int(rng, newLines.length - 1);
    const kind = int(rng, 3);
    if (kind === 0) newLines.splice(at, 1);
    else if (kind === 1) newLines.splice(at, 0, line());
    else if (kind === 2) newLines[at] = line();
    else newLines[at] += ` ${pick(rng, words)}`;
  }
  return [`${oldLines.join('\n')}\n`, `${newLines.join('\n')}\n`];
}

test('DONE: 5,000-line texts with 200 scattered edits diff in under 1 s', () => {
  const [a, b] = bigPair();
  for (const mode of MODES) {
    const start = performance.now();
    const result = compare(a, b, { mode });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1000, `${mode} mode took ${elapsed.toFixed(0)} ms`);
    assert.ok(result.changes.length > 0);
    assert.equal(applyEdits(a, result.script), b);
    assert.deepEqual(applyPatch(a, result.unified), { ok: true, text: b });
  }
  const start = performance.now();
  const lines = diffText(a, b);
  const patch = unifiedDiff(a, b);
  assert.ok(performance.now() - start < 1000);
  assert.ok(editDistance(lines.runs) <= 400);
  assert.deepEqual(applyPatch(a, patch), { ok: true, text: b });
});
