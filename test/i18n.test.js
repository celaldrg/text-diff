import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  LANGUAGES,
  STRINGS,
  errorKey,
  formatPercent,
  normalizeLanguage,
  otherLanguage,
  translate,
} from '../src/i18n.js';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const sources = readdirSync(new URL('src/', root))
  .filter((name) => name.endsWith('.js'))
  .map((name) => readFileSync(new URL(`src/${name}`, root), 'utf8'));

const ERROR_CODES = ['hunk-failed', 'no-hunks', 'bad-header', 'bad-line', 'too-many-lines', 'truncated', 'multiple-files'];

/** @returns {string[]} the "{name}" placeholders of an entry, sorted */
function placeholders(entry) {
  const texts = typeof entry === 'string' ? [entry] : Object.values(entry);
  return [...new Set(texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
}

/** @returns {string[]} the first capture group of every match of `pattern` in `texts` */
function captures(texts, pattern) {
  return texts.flatMap((text) => [...text.matchAll(pattern)].map((m) => m[1]));
}

test('both languages have the same keys and placeholders', () => {
  assert.deepEqual(LANGUAGES, ['en', 'tr']);
  const keys = Object.keys(STRINGS.en).sort();
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), keys);
  for (const key of keys) {
    assert.deepEqual(placeholders(STRINGS.tr[key]), placeholders(STRINGS.en[key]), key);
    for (const lang of LANGUAGES) {
      const entry = STRINGS[lang][key];
      if (typeof entry === 'string') assert.notEqual(entry.trim(), '', `${lang}.${key}`);
      else assert.deepEqual(Object.keys(entry).sort(), ['one', 'other'], `${lang}.${key}`);
    }
  }
});

test('every key the page and the UI use exists', () => {
  const used = [
    ...captures([html], /data-i18n(?:-[\w-]+)?="(\w+)"/g),
    ...captures(sources, /\bt\('(\w+)'/g),
    ...captures(sources, /showToast\('(\w+)'/g),
    ...captures(sources, /\b(?:key|reason): '(\w+)'/g),
    ...ERROR_CODES.map(errorKey),
    errorKey('something-else'),
  ];
  assert.ok(used.length > 50);
  for (const key of used) assert.ok(Object.hasOwn(STRINGS.en, key), key);
});

test('every key is used somewhere', () => {
  const everything = [html, ...sources].join('\n');
  for (const key of Object.keys(STRINGS.en)) {
    assert.ok(everything.includes(`"${key}"`) || everything.includes(`'${key}'`), key);
  }
});

test('the page text before the script runs is the English text', () => {
  for (const match of html.matchAll(/data-i18n="(\w+)"[^>]*>([^<]*)</g)) {
    const [, key, text] = match;
    if (text.trim() !== '') assert.equal(text, translate('en', key), key);
  }
  for (const [tag] of html.matchAll(/<[a-z][^>]*>/g)) {
    for (const attribute of ['title', 'placeholder', 'aria-label']) {
      const key = tag.match(new RegExp(`data-i18n-${attribute}="(\\w+)"`))?.[1];
      if (!key) continue;
      const value = tag.match(new RegExp(`(?<![\\w-])${attribute}="([^"]*)"`))?.[1];
      assert.equal(value, translate('en', key), `${attribute} ${key}`);
    }
  }
});

test('plural forms follow the language rules', () => {
  assert.equal(translate('en', 'lineCount', { n: 1 }), '1 line');
  assert.equal(translate('en', 'lineCount', { n: 2 }), '2 lines');
  assert.equal(translate('en', 'lineCount', { n: 0 }), '0 lines');
  assert.equal(translate('tr', 'lineCount', { n: 1 }), '1 satır');
  assert.equal(translate('tr', 'lineCount', { n: 7 }), '7 satır');
  assert.equal(translate('en', 'changeCount', { n: 1 }), '1 change');
});

test('placeholders are filled and unknown keys come back unchanged', () => {
  assert.equal(translate('en', 'changePosition', { current: 2, total: 5 }), '2 of 5');
  assert.equal(translate('tr', 'changePosition', { current: 2, total: 5 }), '2 / 5');
  assert.equal(translate('en', 'changePosition', { current: 2 }), '2 of {total}');
  assert.equal(translate('en', 'no-such-key'), 'no-such-key');
  assert.equal(translate('en', 'toString'), 'toString');
  assert.equal(translate('de', 'clear'), 'Clear');
});

test('languages are normalised and toggled', () => {
  assert.equal(normalizeLanguage('tr'), 'tr');
  assert.equal(normalizeLanguage('TR'), 'en');
  assert.equal(normalizeLanguage(null), 'en');
  assert.equal(otherLanguage('en'), 'tr');
  assert.equal(otherLanguage('tr'), 'en');
  assert.equal(otherLanguage('xx'), 'tr');
});

test('every patch error code has its own message, with the patch line where there is one', () => {
  const keys = ERROR_CODES.map(errorKey);
  assert.equal(new Set(keys).size, ERROR_CODES.length);
  assert.ok(!keys.includes('errUnknown'));
  for (const code of ERROR_CODES.filter((c) => c !== 'no-hunks')) {
    assert.ok(STRINGS.en[errorKey(code)].includes('{line}'), code);
  }
  assert.equal(errorKey('nope'), 'errUnknown');
  assert.equal(errorKey('toString'), 'errUnknown');
  assert.equal(
    translate('en', errorKey('hunk-failed'), { hunk: 2, total: 3, line: 14 }),
    'Hunk 2 of 3 (patch line 14) does not match the original text.',
  );
});

test('percentages keep one decimal and never round up to 100', () => {
  assert.equal(formatPercent('en', 57.3), '57.3%');
  assert.equal(formatPercent('en', 71.42857), '71.4%');
  assert.equal(formatPercent('en', 99.96), '99.9%');
  assert.equal(formatPercent('en', 100), '100%');
  assert.equal(formatPercent('en', 0), '0%');
  assert.equal(formatPercent('tr', 71.42857), '%71,4');
  assert.equal(formatPercent('tr', 50), '%50');
});
