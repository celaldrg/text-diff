/**
 * Pure presentation helpers for the UI: what a rendered line shows, which
 * rows belong to which change, how patch lines are coloured and how a
 * failing hunk is shown. No DOM.
 * @module format
 */

/** @typedef {import('./compare.js').Part} Part */
/** @typedef {import('./unified.js').Hunk} Hunk */

/**
 * A piece of a rendered line. `eol` marks a changed line break, shown as
 * {@link EOL_MARK}.
 * @typedef {{text: string, changed: boolean, eol: boolean}} Segment
 */

/** Marker shown where a line break was added or removed. */
export const EOL_MARK = '↵';

/** Row kinds that belong to a change (side-by-side and inline rows). */
const CHANGE_KINDS = new Set(['change', 'delete', 'insert']);

/**
 * Turns the parts of a line into what a view shows: unchanged line breaks
 * are dropped and changed ones become a visible marker.
 * @param {Part[]} parts
 * @returns {Segment[]}
 */
export function lineSegments(parts) {
  const out = [];
  for (const part of parts) {
    if (part.text === '\n' || part.text === '\r\n') {
      if (part.changed) out.push({ text: EOL_MARK, changed: true, eol: true });
    } else {
      out.push({ text: part.text, changed: part.changed, eol: false });
    }
  }
  return out;
}

/**
 * Finds the rows of every change: from its first row up to the first row
 * that is not part of a change.
 * @param {Array<{kind: string}>} rows side-by-side or inline rows
 * @param {number[]} starts the first row of every change
 * @returns {Array<[number, number]>} [start, end) for every change
 */
export function changeExtents(rows, starts) {
  return starts.map((start) => {
    let end = start;
    while (end < rows.length && CHANGE_KINDS.has(rows[end].kind)) end++;
    return [start, end];
  });
}

/**
 * Classifies the lines of a unified diff for colouring. Lines before the
 * first hunk header are file headers ("---"/"+++") or other metadata;
 * inside hunks the first character decides.
 * @param {string[]} lines
 * @returns {Array<'file'|'meta'|'hunk'|'add'|'del'|'context'|'note'>}
 */
export function patchLineKinds(lines) {
  let inHunk = false;
  return lines.map((line) => {
    if (line.startsWith('@@')) {
      inHunk = true;
      return 'hunk';
    }
    if (!inHunk) return line.startsWith('--- ') || line.startsWith('+++ ') ? 'file' : 'meta';
    if (line.startsWith('+')) return 'add';
    if (line.startsWith('-')) return 'del';
    return line.startsWith('\\') ? 'note' : 'context';
  });
}

/**
 * The lines of a hunk as they read in the patch: its header line, taken
 * from the patch text, then its lines with their "\ No newline" notes.
 * @param {string} patchText the patch the hunk was parsed from
 * @param {Hunk} hunk
 * @returns {string[]}
 */
export function hunkLines(patchText, hunk) {
  const header = (patchText.split('\n')[hunk.line - 1] ?? '').replace(/\r$/, '');
  const out = [header];
  for (const line of hunk.lines) {
    out.push(line.op + line.text.replace(/\r$/, ''));
    if (!line.newline) out.push('\\ No newline at end of file');
  }
  return out;
}

/**
 * Name for a downloaded patch: the original file's name with a ".diff"
 * extension, or "changes.diff".
 * @param {string} [originalName]
 * @returns {string}
 */
export function patchFileName(originalName = '') {
  const base = originalName.replace(/(.)\.[^.]*$/, '$1').trim();
  return `${base || 'changes'}.diff`;
}

/**
 * @param {string} text
 * @returns {boolean} true when the text holds NUL characters, as binary files do
 */
export function looksBinary(text) {
  return text.includes('\0');
}
