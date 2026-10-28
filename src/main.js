/**
 * Text Diff UI: connects the text panes, the options, the result views and
 * the patch tools to a comparison session. UI module (DOM).
 * @module main
 */

import { DEMO_LEFT, DEMO_RIGHT, createDemoSession } from './demo.js';
import { MAX_FILE_MB, blockStrayDrops, makeDropZone, makeFileButton, readTextFile } from './files.js';
import { hunkLines, patchFileName } from './format.js';
import { errorKey, formatPercent, normalizeLanguage, otherLanguage, translate } from './i18n.js';
import { buildInlineView, buildPatchLines, buildSplitView } from './render.js';
import { createSession } from './session.js';
import { load, save } from './storage.js';
import { splitLines } from './tokens.js';
import { parseUnified } from './unified.js';

/** Same width as the phone breakpoint in style.css. */
const NARROW_QUERY = '(max-width: 640px)';
/** Pause after the last keystroke before the texts are compared again. */
const TYPING_DELAY_MS = 150;
/** How long a message stays on screen. */
const TOAST_MS = 4500;
/** Translated attributes: data-i18n-<attribute> holds the string key. */
const I18N_ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

const narrow = window.matchMedia(NARROW_QUERY);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isDemo = new URLSearchParams(window.location.search).has('demo');

let lang = normalizeLanguage(load('lang', 'en'));
const session = isDemo ? createDemoSession() : createSession({ options: storedOptions() });

/** UI state that the session does not hold. */
const ui = {
  /** chosen tab: "split", "inline", "patch" or "apply" */
  view: 'split',
  /** the diff tab to return to when a change is selected from another tab */
  diffView: 'split',
  /** names of the opened files */
  names: { left: '', right: '' },
  /** patch text exactly as typed or opened (a textarea would turn CRLF into LF) */
  patchText: '',
  /** outcome of the last "apply patch" */
  outcome: null,
  /** message on screen: {key, params, action?} */
  toast: null,
  /** built diff views and the comparison each was built from */
  built: { split: null, inline: null },
  /** comparison the patch view and the outcome view were built from */
  shown: { patch: null, outcome: null },
  /** rows marked as the selected change */
  marked: [],
};

const dom = {};
let typingTimer = 0;
let toastTimer = 0;

/** @returns {Partial<import('./compare.js').Options>} saved options, or none */
function storedOptions() {
  const stored = load('options', {});
  return stored && typeof stored === 'object' ? stored : {};
}

/**
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string} the string in the current language
 */
function t(key, params) {
  return translate(lang, key, params);
}

/** @returns {string} the view on screen: side by side turns inline on phones */
function activeView() {
  return ui.view === 'split' && narrow.matches ? 'inline' : ui.view;
}

/**
 * @param {string} view
 * @returns {boolean} true for the two diff views
 */
function isDiffView(view) {
  return view === 'split' || view === 'inline';
}

/* ---------- rendering ---------- */

/** Puts the strings of the current language into the static page. */
function applyStaticStrings() {
  document.documentElement.lang = lang;
  document.title = t('appTitle');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const attribute of I18N_ATTRIBUTES) {
    for (const node of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`)));
    }
  }
  dom.lang.textContent = otherLanguage(lang).toUpperCase();
}

/** Redraws everything that depends on the texts, options or language. */
function renderAll() {
  renderPaneMeta();
  renderResult();
  renderToast();
}

/** Shows the file name and line count above each text. */
function renderPaneMeta() {
  for (const side of ['left', 'right']) {
    const text = dom[side].value;
    const lines = text === '' ? '' : t('lineCount', { n: splitLines(text).length });
    dom[`${side}Meta`].textContent = [ui.names[side], lines].filter(Boolean).join(' · ');
    dom[`${side}Meta`].title = ui.names[side];
  }
}

/** Compares (when needed) and redraws the stats, navigation and active view. */
function renderResult() {
  clearTimeout(typingTimer);
  const state = session.getState();
  const view = activeView();
  renderStats(state);
  renderNav(state);
  renderTabs(view);
  const blank = state.left === '' && state.right === '';
  const notice = noticeKey(state, blank);
  dom.empty.hidden = !(isDiffView(view) && blank);
  dom.notice.hidden = !(isDiffView(view) && notice);
  dom.notice.textContent = notice ? t(notice) : '';
  if (isDiffView(view)) renderDiff(view, state, blank);
  else if (view === 'patch') renderPatch(state.result);
  else renderApply();
}

/**
 * @param {import('./session.js').SessionState} state
 * @param {boolean} blank both texts are empty
 * @returns {string} i18n key of the note above the diff, "" for none
 */
function noticeKey({ left, right, result }, blank) {
  if (blank) return '';
  if (result.changes.length === 0) return left === right ? 'identical' : 'noDifferences';
  return result.coarse > 0 ? 'coarseNotice' : '';
}

/** @param {import('./session.js').SessionState} state */
function renderStats({ left, right, result }) {
  const { added, removed, changed, similarity } = result.stats;
  const blank = left === '' && right === '';
  dom.statAdded.textContent = `+${added}`;
  dom.statRemoved.textContent = `−${removed}`;
  dom.statChanged.textContent = `~${changed}`;
  dom.statSimilarity.textContent = blank ? '—' : formatPercent(lang, similarity);
  dom.simBar.style.width = `${blank ? 0 : similarity}%`;
}

/** @param {import('./session.js').SessionState} state */
function renderNav({ result, current }) {
  const total = result.changes.length;
  dom.prev.disabled = total === 0;
  dom.next.disabled = total === 0;
  if (total === 0) dom.counter.textContent = t('noChanges');
  else if (current < 0) dom.counter.textContent = t('changeCount', { n: total });
  else dom.counter.textContent = t('changePosition', { current: current + 1, total });
}

/** Marks the tab of `view` as selected and shows its panel. */
function renderTabs(view) {
  for (const tab of dom.tabs) {
    const selected = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const [name, panel] of Object.entries(dom.panels)) panel.hidden = name !== view;
}

/**
 * Shows the side-by-side or inline rows, rebuilding them only when the
 * comparison changed, and marks the selected change.
 */
function renderDiff(view, { result, current }, blank) {
  const panel = dom.panels[view];
  panel.hidden = blank;
  if (blank) return;
  if (ui.built[view]?.result !== result) {
    const built = view === 'split' ? buildSplitView(result) : buildInlineView(result);
    panel.style.setProperty('--num-w', `calc(${built.numberWidth}ch + 14px)`);
    panel.replaceChildren(built.fragment);
    ui.built[view] = { result, changes: built.changes };
  }
  markRows(ui.built[view].changes[current] ?? []);
}

/** Moves the "current" mark to `rows`. */
function markRows(rows) {
  for (const row of ui.marked) row.classList.remove('current');
  for (const row of rows) row.classList.add('current');
  ui.marked = rows;
}

/** @param {import('./compare.js').Comparison} result */
function renderPatch(result) {
  const lines = result.unified === '' ? [] : result.unified.replace(/\n$/, '').split('\n');
  const hunks = lines.filter((line) => line.startsWith('@@')).length;
  dom.copy.disabled = hunks === 0;
  dom.download.disabled = hunks === 0;
  dom.patchOutput.hidden = hunks === 0;
  dom.patchEmpty.hidden = hunks > 0;
  dom.hunkCount.textContent = hunks > 0 ? t('hunkCount', { n: hunks }) : '';
  if (ui.shown.patch !== result) {
    dom.patchOutput.replaceChildren(buildPatchLines(lines));
    ui.shown.patch = result;
  }
}

/** Shows the outcome of the last "apply patch": the new text or the failing hunk. */
function renderApply() {
  const { outcome } = ui;
  dom.outcome.hidden = !outcome;
  if (!outcome) return;
  const ok = outcome.ok;
  dom.applyStatus.className = `status ${ok ? 'ok' : 'error'}`;
  dom.applyStatus.textContent = ok ? t('applied', { n: outcome.hunks }) : t(outcome.key, outcome.params);
  const hasText = ok || outcome.lines !== null;
  dom.applyTitle.hidden = !hasText;
  dom.applyOutput.hidden = !hasText;
  dom.applyTitle.textContent = ok ? t('resultTitle') : t('failingHunk');
  if (hasText && ui.shown.outcome !== outcome) {
    dom.applyOutput.classList.toggle('is-patch', !ok);
    dom.applyOutput.replaceChildren(ok ? document.createTextNode(outcome.text) : buildPatchLines(outcome.lines));
    ui.shown.outcome = outcome;
  }
}

/* ---------- messages ---------- */

/**
 * Shows a short message, optionally with an action button.
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @param {{key: string, run: () => void}|null} [action]
 */
function showToast(key, params = {}, action = null) {
  ui.toast = { key, params, action };
  renderToast();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? TOAST_MS * 1.5 : TOAST_MS);
}

function hideToast() {
  ui.toast = null;
  renderToast();
}

function renderToast() {
  const { toast } = ui;
  dom.toast.classList.toggle('show', toast !== null);
  if (!toast) return;
  dom.toastText.textContent = t(toast.key, toast.params);
  dom.toastAction.hidden = !toast.action;
  if (toast.action) dom.toastAction.textContent = t(toast.action.key);
}

/* ---------- texts ---------- */

/** Copies the session's texts into the text areas. */
function syncTextAreas() {
  const { left, right } = session.getState();
  dom.left.value = left;
  dom.right.value = right;
}

/**
 * Replaces one text, for example with an opened file.
 * @param {'left'|'right'} side
 * @param {string} text
 * @param {string} name file name, "" when the text was not opened from a file
 */
function setText(side, text, name) {
  if (side === 'left') {
    session.setLeft(text);
    ui.outcome = null;
  } else {
    session.setRight(text);
  }
  ui.names[side] = name;
  dom[side].value = text;
  renderAll();
}

/** Handles typing in one of the text areas: the comparison follows after a short pause. */
function onType(side) {
  if (side === 'left') {
    session.setLeft(dom.left.value);
    ui.outcome = null;
  } else {
    session.setRight(dom.right.value);
  }
  renderPaneMeta();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(renderResult, TYPING_DELAY_MS);
}

function swapTexts() {
  session.swap();
  ui.names = { left: ui.names.right, right: ui.names.left };
  ui.outcome = null;
  syncTextAreas();
  renderAll();
}

function clearAll() {
  const { left, right } = session.getState();
  if (left === '' && right === '' && ui.patchText === '') return;
  const before = { left, right, names: ui.names, patchText: ui.patchText, outcome: ui.outcome };
  session.clear();
  ui.names = { left: '', right: '' };
  setPatchText('');
  syncTextAreas();
  renderAll();
  showToast('cleared', {}, { key: 'undo', run: () => restore(before) });
}

/** Brings back what "Clear" removed. */
function restore(before) {
  session.setLeft(before.left);
  session.setRight(before.right);
  ui.names = before.names;
  setPatchText(before.patchText);
  ui.outcome = before.outcome;
  syncTextAreas();
  renderAll();
}

function loadExample() {
  session.setLeft(DEMO_LEFT);
  session.setRight(DEMO_RIGHT);
  session.nextChange();
  ui.names = { left: '', right: '' };
  ui.outcome = null;
  syncTextAreas();
  renderAll();
}

/**
 * Opens a file into a text or into the patch box.
 * @param {'left'|'right'|'patch'} target
 * @param {File} file
 */
async function openFile(target, file) {
  const read = await readTextFile(file);
  if (!read.ok) {
    showToast(read.reason, { name: file.name, size: MAX_FILE_MB });
    return;
  }
  if (target === 'patch') {
    setPatchText(read.text);
    renderResult();
  } else {
    setText(target, read.text, file.name);
  }
  showToast('fileLoaded', { name: file.name });
}

/** Two files dropped at once become the original and the changed text. */
function onDropFiles(target, files) {
  if (target !== 'patch' && files.length >= 2) {
    openFile('left', files[0]);
    openFile('right', files[1]);
  } else {
    openFile(target, files[0]);
  }
}

/* ---------- options and views ---------- */

/** Shows the options in the controls. */
function showOptions(options) {
  dom.mode.value = options.mode;
  dom.ignoreWhitespace.checked = options.ignoreWhitespace;
  dom.ignoreCase.checked = options.ignoreCase;
  dom.ignoreBlank.checked = options.ignoreBlankLines;
  dom.context.value = String(options.context);
}

/** Reads the controls into the session, saves them and redraws. */
function onOptionsChange() {
  const options = session.setOptions({
    mode: dom.mode.value,
    ignoreWhitespace: dom.ignoreWhitespace.checked,
    ignoreCase: dom.ignoreCase.checked,
    ignoreBlankLines: dom.ignoreBlank.checked,
    context: dom.context.value,
  });
  save('options', options);
  renderResult();
  return options;
}

/**
 * Switches to a tab.
 * @param {string} view
 * @param {boolean} [focus] also move the keyboard focus to the tab
 */
function selectView(view, focus = false) {
  ui.view = view;
  if (isDiffView(view)) ui.diffView = view;
  renderResult();
  if (focus) dom.tabs.find((tab) => tab.dataset.view === activeView())?.focus();
}

/** Arrow keys, Home and End move between the visible tabs. */
function onTabKey(event) {
  const visible = dom.tabs.filter((tab) => tab.getClientRects().length > 0);
  const index = visible.indexOf(event.currentTarget);
  const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: visible.length - 1 };
  if (!(event.key in moves)) return;
  event.preventDefault();
  const next = (moves[event.key] + visible.length) % visible.length;
  selectView(visible[next].dataset.view, true);
}

/**
 * Selects the next (1) or previous (-1) change and scrolls to it, switching
 * to a diff view when another tab is open.
 * @param {1|-1} direction
 */
function goToChange(direction) {
  const index = direction > 0 ? session.nextChange() : session.prevChange();
  if (index < 0) return;
  if (!isDiffView(activeView())) ui.view = ui.diffView;
  renderResult();
  ui.marked[0]?.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

/** Tapping or clicking a changed row selects that change. */
function onRowClick(event) {
  const row = event.target.closest('[data-change]');
  if (!row || String(window.getSelection() ?? '') !== '') return;
  session.selectChange(Number(row.dataset.change));
  renderResult();
}

/** @returns {boolean} true while the user types into a text field */
function isTyping(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'file'].includes(target.type);
}

/** N and P jump between changes when no text field has the focus. */
function onKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || isTyping(event.target)) return;
  const key = String(event.key ?? '').toLowerCase();
  if (key !== 'n' && key !== 'p') return;
  event.preventDefault();
  goToChange(key === 'n' ? 1 : -1);
}

/* ---------- patch tools ---------- */

async function copyPatch() {
  const text = session.getState().result.unified;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('copied');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(dom.patchOutput);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    showToast('copyFailed');
  }
}

function downloadPatch() {
  const text = session.getState().result.unified;
  if (!text) return;
  const name = patchFileName(ui.names.left);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/x-diff' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('downloaded', { name });
}

/** Sets the patch text; the last outcome no longer applies to it. */
function setPatchText(text) {
  ui.patchText = text;
  dom.patchInput.value = text;
  ui.outcome = null;
}

/** Applies the patch to the original text; on success the result becomes the changed text. */
function applyPatchText() {
  const patch = ui.patchText;
  if (patch.trim() === '') {
    ui.outcome = { ok: false, key: 'needPatch', params: {}, lines: null };
  } else {
    const applied = session.applyPatch(patch);
    if (applied.ok) {
      ui.outcome = { ok: true, hunks: parseUnified(patch).patch.hunks.length, text: applied.text };
      ui.names.right = '';
      syncTextAreas();
    } else {
      ui.outcome = { ok: false, ...describeFailure(patch, applied) };
    }
  }
  renderAll();
}

/**
 * @param {string} patch
 * @param {{error: string, line: number, hunk?: number}} failure
 * @returns {{key: string, params: Record<string, number>, lines: string[]|null}} message and failing hunk
 */
function describeFailure(patch, failure) {
  if (failure.error !== 'hunk-failed') return { key: errorKey(failure.error), params: { line: failure.line }, lines: null };
  const { hunks } = parseUnified(patch).patch;
  return {
    key: errorKey(failure.error),
    params: { hunk: failure.hunk + 1, total: hunks.length, line: failure.line },
    lines: hunkLines(patch, hunks[failure.hunk]),
  };
}

/* ---------- start ---------- */

function toggleLanguage() {
  lang = otherLanguage(lang);
  save('lang', lang);
  applyStaticStrings();
  renderAll();
}

/** Finds the elements the UI works with. */
function collectElements() {
  const $ = (id) => document.getElementById(id);
  Object.assign(dom, {
    left: $('left'),
    right: $('right'),
    leftMeta: $('left-meta'),
    rightMeta: $('right-meta'),
    mode: $('mode'),
    ignoreWhitespace: $('ignore-whitespace'),
    ignoreCase: $('ignore-case'),
    ignoreBlank: $('ignore-blank'),
    context: $('context'),
    tabs: Array.from(document.querySelectorAll('[role="tab"]')),
    panels: { split: $('panel-split'), inline: $('panel-inline'), patch: $('panel-patch'), apply: $('panel-apply') },
    statAdded: $('stat-added'),
    statRemoved: $('stat-removed'),
    statChanged: $('stat-changed'),
    statSimilarity: $('stat-similarity'),
    simBar: $('sim-bar'),
    prev: $('prev'),
    next: $('next'),
    counter: $('counter'),
    notice: $('notice'),
    empty: $('empty'),
    hunkCount: $('hunk-count'),
    patchOutput: $('patch-output'),
    patchEmpty: $('patch-empty'),
    copy: $('copy-patch'),
    download: $('download-patch'),
    patchInput: $('patch-input'),
    outcome: $('apply-outcome'),
    applyStatus: $('apply-status'),
    applyTitle: $('apply-title'),
    applyOutput: $('apply-output'),
    toast: $('toast'),
    toastText: $('toast-text'),
    toastAction: $('toast-action'),
    lang: $('lang'),
  });
}

/** Connects every control to its handler. */
function wireEvents() {
  for (const side of ['left', 'right']) {
    dom[side].addEventListener('input', () => onType(side));
    makeFileButton(document.getElementById(`open-${side}`), document.getElementById(`file-${side}`), (file) =>
      openFile(side, file),
    );
    makeDropZone(document.getElementById(`pane-${side}`), (files) => onDropFiles(side, files));
  }
  makeFileButton(document.getElementById('open-patch'), document.getElementById('file-patch'), (file) =>
    openFile('patch', file),
  );
  makeDropZone(document.getElementById('patch-zone'), (files) => onDropFiles('patch', files));
  blockStrayDrops(window);

  document.getElementById('swap').addEventListener('click', swapTexts);
  document.getElementById('clear').addEventListener('click', clearAll);
  document.getElementById('try-example').addEventListener('click', loadExample);
  dom.lang.addEventListener('click', toggleLanguage);

  for (const control of [dom.mode, dom.ignoreWhitespace, dom.ignoreCase, dom.ignoreBlank]) {
    control.addEventListener('change', onOptionsChange);
  }
  dom.context.addEventListener('input', onOptionsChange);
  dom.context.addEventListener('change', () => showOptions(onOptionsChange()));

  for (const tab of dom.tabs) {
    tab.addEventListener('click', () => selectView(tab.dataset.view));
    tab.addEventListener('keydown', onTabKey);
  }
  dom.prev.addEventListener('click', () => goToChange(-1));
  dom.next.addEventListener('click', () => goToChange(1));
  dom.panels.split.addEventListener('click', onRowClick);
  dom.panels.inline.addEventListener('click', onRowClick);
  document.addEventListener('keydown', onKeyDown);
  narrow.addEventListener('change', renderResult);

  dom.copy.addEventListener('click', copyPatch);
  dom.download.addEventListener('click', downloadPatch);
  document.getElementById('apply').addEventListener('click', applyPatchText);
  dom.patchInput.addEventListener('input', () => {
    ui.patchText = dom.patchInput.value;
    ui.outcome = null;
    renderApply();
  });
  dom.patchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    applyPatchText();
  });
  dom.toastAction.addEventListener('click', () => {
    const action = ui.toast?.action;
    hideToast();
    action?.run();
  });
}

function init() {
  collectElements();
  wireEvents();
  showOptions(session.getState().options);
  syncTextAreas();
  applyStaticStrings();
  renderAll();
}

init();
