/**
 * DOM builders for the result views. All text goes in through text nodes
 * or textContent; nothing is ever parsed as HTML.
 * @module render
 */

import { changeExtents, lineSegments, patchLineKinds } from './format.js';

/** @typedef {import('./compare.js').Comparison} Comparison */
/** @typedef {import('./compare.js').Part} Part */

/**
 * A built view: its rows, plus the row elements of every change so the UI
 * can mark the selected one and scroll to it.
 * @typedef {{fragment: DocumentFragment, changes: HTMLElement[][], numberWidth: number}} BuiltView
 */

/** Background tone of the left and right side of each side-by-side row kind. */
const SPLIT_TONES = {
  equal: ['', ''],
  change: ['del', 'add'],
  delete: ['del', ''],
  insert: ['', 'add'],
  ignored: ['ignored', 'ignored'],
};

/** Tone and sign of each inline row kind. */
const INLINE_STYLE = {
  equal: ['', ' '],
  delete: ['del', '−'],
  insert: ['add', '+'],
  ignored: ['ignored', ' '],
};

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Appends a line's segments to a code cell; changed segments are wrapped in
 * `markTag` ("del" on the old side, "ins" on the new side).
 * @param {HTMLElement} cell
 * @param {Part[]} parts
 * @param {'del'|'ins'} markTag
 */
function fillCode(cell, parts, markTag) {
  for (const segment of lineSegments(parts)) {
    if (segment.changed) cell.append(el(markTag, segment.eol ? 'eol' : '', segment.text));
    else cell.append(segment.text);
  }
}

/**
 * @param {number} rowCount
 * @param {Array<[number, number]>} extents
 * @returns {Int32Array} change index of every row, -1 outside changes
 */
function changeIndexByRow(rowCount, extents) {
  const index = new Int32Array(rowCount).fill(-1);
  extents.forEach(([start, end], change) => index.fill(change, start, end));
  return index;
}

/**
 * Builds the side-by-side view: old line number, old text, new line
 * number, new text. A missing side is drawn as an empty filler.
 * @param {Comparison} result
 * @returns {BuiltView}
 */
export function buildSplitView(result) {
  const extents = changeExtents(
    result.rows,
    result.changes.map((change) => change.row),
  );
  const changeOf = changeIndexByRow(result.rows.length, extents);
  const changes = extents.map(() => []);
  const fragment = document.createDocumentFragment();
  let widest = 1;
  result.rows.forEach((row, index) => {
    const node = el('div', `row ${row.kind}`);
    const [leftTone, rightTone] = SPLIT_TONES[row.kind];
    appendSide(node, row.left, leftTone, 'del');
    appendSide(node, row.right, rightTone, 'ins');
    widest = Math.max(widest, row.left?.num ?? 0, row.right?.num ?? 0);
    tagChange(node, changeOf[index], changes);
    fragment.append(node);
  });
  return { fragment, changes, numberWidth: String(widest).length };
}

/**
 * Appends the number cell and the code cell of one side of a row.
 * @param {HTMLElement} row
 * @param {{num: number, parts: Part[]}|null} side
 * @param {string} tone
 * @param {'del'|'ins'} markTag
 */
function appendSide(row, side, tone, markTag) {
  if (!side) {
    row.append(el('span', 'num none'), el('span', 'code none'));
    return;
  }
  const code = el('span', `code ${tone}`.trim());
  fillCode(code, side.parts, markTag);
  row.append(el('span', `num ${tone}`.trim(), String(side.num)), code);
}

/**
 * Builds the inline view: old number, new number, sign and text, with the
 * removed lines of a change before the added ones.
 * @param {Comparison} result
 * @returns {BuiltView}
 */
export function buildInlineView(result) {
  const extents = changeExtents(
    result.inline,
    result.changes.map((change) => change.inline),
  );
  const changeOf = changeIndexByRow(result.inline.length, extents);
  const changes = extents.map(() => []);
  const fragment = document.createDocumentFragment();
  let widest = 1;
  result.inline.forEach((row, index) => {
    const [tone, sign] = INLINE_STYLE[row.kind];
    const node = el('div', `row ${row.kind}`);
    const code = el('span', `code ${tone}`.trim());
    fillCode(code, row.parts, row.kind === 'insert' ? 'ins' : 'del');
    node.append(
      el('span', `num ${tone}`.trim(), row.aNum === null ? '' : String(row.aNum)),
      el('span', `num ${tone}`.trim(), row.bNum === null ? '' : String(row.bNum)),
      el('span', `sign ${tone}`.trim(), sign),
      code,
    );
    widest = Math.max(widest, row.aNum ?? 0, row.bNum ?? 0);
    tagChange(node, changeOf[index], changes);
    fragment.append(node);
  });
  return { fragment, changes, numberWidth: String(widest).length };
}

/**
 * Records a row as part of change `change` (when it is one).
 * @param {HTMLElement} node
 * @param {number} change
 * @param {HTMLElement[][]} changes
 */
function tagChange(node, change, changes) {
  if (change < 0) return;
  node.dataset.change = String(change);
  changes[change].push(node);
}

/**
 * Builds coloured patch lines, one block element per line.
 * @param {string[]} lines lines of a unified diff, without line breaks
 * @returns {DocumentFragment}
 */
export function buildPatchLines(lines) {
  const fragment = document.createDocumentFragment();
  const kinds = patchLineKinds(lines);
  lines.forEach((line, index) => fragment.append(el('span', `pl ${kinds[index]}`, line)));
  return fragment;
}
