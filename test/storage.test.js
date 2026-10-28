import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save } from '../src/storage.js';

/** A Storage stand-in backed by a Map. */
function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

test('values round trip as JSON under the app prefix', () => {
  const backend = memoryStorage();
  assert.equal(save('options', { mode: 'words', context: 5 }, backend), true);
  assert.equal(save('lang', 'tr', backend), true);
  assert.deepEqual([...backend.items.keys()], ['text-diff:options', 'text-diff:lang']);
  assert.deepEqual(load('options', null, backend), { mode: 'words', context: 5 });
  assert.equal(load('lang', 'en', backend), 'tr');
});

test('missing or unreadable values give the fallback', () => {
  const backend = memoryStorage();
  assert.equal(load('lang', 'en', backend), 'en');
  backend.items.set('text-diff:lang', '{not json');
  assert.equal(load('lang', 'en', backend), 'en');
  assert.equal(load('lang', 'en', null), 'en');
});

test('blocked storage never throws', () => {
  const blocked = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(load('lang', 'en', blocked), 'en');
  assert.equal(save('lang', 'tr', blocked), false);
  assert.equal(save('lang', 'tr', null), false);
});
