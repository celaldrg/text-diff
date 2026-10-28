import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, foldCase, isBlankLine, keyFunction, splitLines, tokenKeys, tokenize } from '../src/tokens.js';

test('lines keep their terminators', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines('a\nb'), ['a\n', 'b']);
  assert.deepEqual(splitLines('a\r\nb\r\n'), ['a\r\n', 'b\r\n']);
  assert.deepEqual(splitLines('\n\n'), ['\n', '\n']);
  assert.deepEqual(splitLines('x\ry\n'), ['x\ry\n']);
});

test('words mode splits words, punctuation, spaces and line breaks', () => {
  assert.deepEqual(tokenize('Hello, world!\n', 'words'), ['Hello', ',', ' ', 'world', '!', '\n']);
  assert.deepEqual(tokenize('Çağlar  ılık_2\r\n', 'words'), ['Çağlar', '  ', 'ılık_2', '\r\n']);
  assert.deepEqual(tokenize('éte', 'words'), ['éte']);
});

test('chars mode keeps marks with their letter and spaces together', () => {
  assert.deepEqual(tokenize('ab  c\r\n', 'chars'), ['a', 'b', '  ', 'c', '\r\n']);
  assert.deepEqual(tokenize('éx', 'chars'), ['é', 'x']);
  assert.deepEqual(tokenize('😀a', 'chars'), ['😀', 'a']);
});

test('every mode is lossless', () => {
  const samples = ['', 'plain', ' lead\ttab \r\n\r\nİı ğ é 😀 x\ry', '́ starts with a mark', '\n'];
  for (const mode of MODES) {
    for (const text of samples) assert.equal(tokenize(text, mode).join(''), text, `${mode}: ${JSON.stringify(text)}`);
  }
});

test('line keys can ignore whitespace and case', () => {
  assert.equal(keyFunction('lines', { ignoreWhitespace: true })('  a \t b  \n'), 'a b');
  assert.equal(keyFunction('lines', { ignoreCase: true })('ABC\n'), 'abc\n');
  assert.equal(keyFunction('lines')(' A\n'), ' A\n');
});

test('token keys can ignore whitespace and case', () => {
  const key = keyFunction('chars', { ignoreWhitespace: true, ignoreCase: true });
  assert.equal(key('\t  '), ' ');
  assert.equal(key('\r\n'), '\n');
  assert.equal(key('Q'), 'q');
});

test('in words mode spaces carry the key of the next token', () => {
  assert.deepEqual(tokenKeys(['a', ' ', 'b', '  '], 'words'), ['a', ' b', 'b', '  ']);
  assert.deepEqual(tokenKeys(['a', '\t', 'B'], 'words', { ignoreWhitespace: true, ignoreCase: true }), ['a', ' b', 'b']);
  assert.deepEqual(tokenKeys(['a', ' ', 'b'], 'chars'), ['a', ' ', 'b']);
});

test('case folding handles the Turkish i', () => {
  assert.equal(foldCase('İSTANBUL'), 'istanbul');
  assert.equal(foldCase('ıstanbul'), 'istanbul');
  assert.equal(foldCase('Istanbul'), 'istanbul');
});

test('blank lines hold only whitespace', () => {
  assert.ok(isBlankLine('\n'));
  assert.ok(isBlankLine(' \t\r\n'));
  assert.ok(!isBlankLine(' x\n'));
});
