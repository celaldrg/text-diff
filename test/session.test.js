import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPTIONS } from '../src/compare.js';
import { DEMO_LEFT, DEMO_RIGHT, createDemoSession } from '../src/demo.js';
import { createSession } from '../src/session.js';
import { applyPatch, unifiedDiff } from '../src/unified.js';

const LEFT = 'a\nb\nc\nd\ne\nf\ng\nh\ni\n';
const RIGHT = 'a\nB\nc\nd\ne\nf\ng\nH\ni\n';

test('a new session is empty', () => {
  const session = createSession();
  const state = session.getState();
  assert.equal(state.left, '');
  assert.equal(state.right, '');
  assert.deepEqual(state.options, DEFAULT_OPTIONS);
  assert.deepEqual(state.result.rows, []);
  assert.equal(state.current, -1);
  assert.equal(session.nextChange(), -1);
  assert.equal(session.prevChange(), -1);
});

test('texts can be set and the result is cached until they change', () => {
  const session = createSession({ left: LEFT });
  session.setRight(RIGHT);
  const first = session.getState().result;
  assert.equal(session.getState().result, first);
  assert.equal(first.changes.length, 2);
  session.setLeft(RIGHT);
  const second = session.getState().result;
  assert.notEqual(second, first);
  assert.equal(second.changes.length, 0);
});

test('change navigation wraps both ways', () => {
  const session = createSession({ left: LEFT, right: RIGHT });
  assert.equal(session.prevChange(), 1);
  assert.equal(session.nextChange(), 0);
  assert.equal(session.nextChange(), 1);
  assert.equal(session.nextChange(), 0);
  assert.equal(session.prevChange(), 1);
  assert.equal(session.getState().current, 1);
  session.setRight(RIGHT);
  assert.equal(session.getState().current, -1, 'editing a text resets the selection');
});

test('a change can be selected directly, out-of-range indexes are ignored', () => {
  const session = createSession({ left: LEFT, right: RIGHT });
  assert.equal(session.selectChange(1), 1);
  assert.equal(session.getState().current, 1);
  for (const bad of [-1, 2, 0.5, Number.NaN, '0']) {
    assert.equal(session.selectChange(bad), -1, String(bad));
    assert.equal(session.getState().current, 1, String(bad));
  }
  assert.equal(session.nextChange(), 0, 'navigation continues from the selected change');
  assert.equal(createSession().selectChange(0), -1);
});

test('options are merged, normalized and reset the selection', () => {
  const session = createSession({ left: 'Hello\n', right: 'hello\n' });
  assert.equal(session.nextChange(), 0);
  const options = session.setOptions({ ignoreCase: true, context: 1 });
  assert.deepEqual(options, { ...DEFAULT_OPTIONS, ignoreCase: true, context: 1 });
  const state = session.getState();
  assert.equal(state.current, -1);
  assert.equal(state.result.changes.length, 0);
  assert.equal(session.setOptions({ mode: 'nonsense' }).mode, 'lines');
  assert.equal(session.getState().options.ignoreCase, true);
});

test('swap and clear', () => {
  const session = createSession({ left: 'old\n', right: 'new\n' });
  session.swap();
  assert.equal(session.getState().left, 'new\n');
  assert.equal(session.getState().right, 'old\n');
  session.clear();
  assert.equal(session.getState().left, '');
  assert.equal(session.getState().right, '');
});

test('applying a patch fills the right side, a failing patch changes nothing', () => {
  const session = createSession({ left: LEFT, right: 'unchanged\n' });
  const patch = unifiedDiff(LEFT, RIGHT);
  assert.deepEqual(session.applyPatch(patch), { ok: true, text: RIGHT });
  assert.equal(session.getState().right, RIGHT);
  session.setLeft(LEFT.replace('c', 'C'));
  session.setRight('kept\n');
  assert.deepEqual(session.applyPatch(patch), { ok: false, error: 'hunk-failed', line: 3, hunk: 0 });
  assert.equal(session.getState().right, 'kept\n');
});

test('the demo session shows every kind of row with the first change selected', () => {
  const state = createDemoSession().getState();
  assert.equal(state.left, DEMO_LEFT);
  assert.equal(state.right, DEMO_RIGHT);
  assert.equal(state.options.mode, 'lines');
  assert.equal(state.current, 0);
  const kinds = new Set(state.result.rows.map((row) => row.kind));
  for (const kind of ['equal', 'change', 'delete', 'insert']) assert.ok(kinds.has(kind), kind);
  assert.equal(state.result.changes.length, 3);
  assert.deepEqual(applyPatch(DEMO_LEFT, state.result.unified), { ok: true, text: DEMO_RIGHT });
  for (const line of [...DEMO_LEFT.split('\n'), ...DEMO_RIGHT.split('\n')]) assert.ok(line.length <= 50, line);
});
