/**
 * Opening text files with a file picker or by dropping them on a zone.
 * UI module (File API and DOM events).
 * @module files
 */

import { looksBinary } from './format.js';

/** Largest file that is opened, in megabytes. */
export const MAX_FILE_MB = 5;

/**
 * @typedef {{ok: true, text: string} | {ok: false, reason: 'fileTooBig'|'fileBinary'|'fileFailed'}} ReadResult
 * `reason` is the i18n key of the message to show.
 */

/**
 * Reads a file as UTF-8 text, refusing large and binary files.
 * @param {File} file
 * @returns {Promise<ReadResult>}
 */
export async function readTextFile(file) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) return { ok: false, reason: 'fileTooBig' };
  try {
    const text = await file.text();
    return looksBinary(text) ? { ok: false, reason: 'fileBinary' } : { ok: true, text };
  } catch {
    return { ok: false, reason: 'fileFailed' };
  }
}

/** @returns {boolean} true when a drag event carries files (dragged text does not) */
function hasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Lets files be dropped on `zone`. While files are held over it the zone has
 * the "dragging" class; dragged text keeps the browser's normal behaviour.
 * @param {HTMLElement} zone
 * @param {(files: File[]) => void} onFiles receives the dropped files
 */
export function makeDropZone(zone, onFiles) {
  let depth = 0;
  zone.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth++;
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('dragging');
  });
  zone.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    zone.classList.remove('dragging');
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  });
}

/**
 * Stops files dropped outside every drop zone from replacing the page.
 * @param {Window} target
 */
export function blockStrayDrops(target) {
  target.addEventListener('dragover', (event) => {
    if (event.defaultPrevented || !hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'none';
  });
  target.addEventListener('drop', (event) => {
    if (!event.defaultPrevented && hasFiles(event)) event.preventDefault();
  });
}

/**
 * Opens the file picker `input` when `button` is pressed.
 * @param {HTMLButtonElement} button
 * @param {HTMLInputElement} input a hidden input of type "file"
 * @param {(file: File) => void} onFile receives the chosen file
 */
export function makeFileButton(button, input, onFile) {
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const [file] = Array.from(input.files ?? []);
    input.value = '';
    if (file) onFile(file);
  });
}
