import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FILE_MB, readTextFile } from '../src/files.js';

test('a text file is read as UTF-8 with its line breaks kept', async () => {
  const file = new File(['café\r\nsecond line\n'], 'notes.txt', { type: 'text/plain' });
  assert.deepEqual(await readTextFile(file), { ok: true, text: 'café\r\nsecond line\n' });
});

test('binary, oversized and unreadable files are refused', async () => {
  const binary = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00])], 'image.png');
  assert.deepEqual(await readTextFile(binary), { ok: false, reason: 'fileBinary' });

  const big = new File([new Uint8Array(MAX_FILE_MB * 1024 * 1024 + 1)], 'big.log');
  assert.deepEqual(await readTextFile(big), { ok: false, reason: 'fileTooBig' });

  const broken = {
    size: 10,
    text: () => Promise.reject(new Error('NotReadableError')),
  };
  assert.deepEqual(await readTextFile(broken), { ok: false, reason: 'fileFailed' });
});
