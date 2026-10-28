/**
 * English and Turkish UI strings, with plural forms and number formatting.
 * Pure: the UI decides where the strings go.
 * @module i18n
 */

/** @typedef {'en'|'tr'} Lang */

/**
 * A string, or plural forms chosen with Intl.PluralRules by the "n" parameter.
 * @typedef {string | {one: string, other: string}} Entry
 */

/** Supported languages; the first one is the default. */
export const LANGUAGES = Object.freeze(['en', 'tr']);

/** @type {Record<string, Entry>} */
const EN = {
  appTitle: 'Text Diff',
  tagline: 'Compare two texts by line, word or character',
  clear: 'Clear',
  clearTitle: 'Clear both texts',
  langSwitch: 'TR: switch to Turkish',
  original: 'Original',
  changed: 'Changed',
  leftPlaceholder: 'Type or paste the original text, or drop a file here',
  rightPlaceholder: 'Type or paste the changed text, or drop a file here',
  openFile: 'Open file',
  openLeftTitle: 'Open a file as the original text',
  openRightTitle: 'Open a file as the changed text',
  dropHere: 'Drop the file to open it',
  lineCount: { one: '{n} line', other: '{n} lines' },
  swap: 'Swap',
  swapTitle: 'Swap the two texts',
  optionsLabel: 'Comparison options',
  compareBy: 'Compare by',
  modeLines: 'Lines',
  modeWords: 'Words',
  modeChars: 'Characters',
  ignoreWhitespace: 'Ignore whitespace',
  ignoreCase: 'Ignore case',
  ignoreBlankLines: 'Ignore blank lines',
  contextLines: 'Context lines',
  contextTitle: 'Unchanged lines shown around each change in the patch',
  viewsLabel: 'Result views',
  tabSplit: 'Side by side',
  tabInline: 'Inline',
  tabPatch: 'Patch',
  tabApply: 'Apply patch',
  statAdded: 'Added',
  statRemoved: 'Removed',
  statChanged: 'Changed',
  statSimilarity: 'Similarity',
  statAddedTitle: 'Lines that are only in the changed text',
  statRemovedTitle: 'Lines that are only in the original text',
  statChangedTitle: 'Lines that were edited',
  statSimilarityTitle: 'Share of the characters that did not change, the unchanged parts of changed lines included',
  percent: '{value}%',
  prevTitle: 'Previous change (P)',
  nextTitle: 'Next change (N)',
  changePosition: '{current} of {total}',
  changeCount: { one: '{n} change', other: '{n} changes' },
  noChanges: 'No changes',
  emptyTitle: 'Nothing to compare yet',
  emptyBody: 'Type, paste, open or drop a text on each side to see what changed.',
  tryExample: 'Try an example',
  identical: 'The two texts are identical.',
  noDifferences: 'No differences with the selected options.',
  coarseNotice: 'Some changes are too big to compare in full detail, so parts of them are shown as replaced as a whole.',
  patchTitle: 'Unified diff',
  hunkCount: { one: '{n} hunk', other: '{n} hunks' },
  copy: 'Copy',
  download: 'Download .diff',
  copied: 'Patch copied to the clipboard.',
  copyFailed: 'Copying was blocked. The patch is selected, so copy it by hand.',
  downloaded: 'Saved as {name}.',
  noPatch: 'No patch: the texts do not differ.',
  patchLabel: 'Patch to apply to the original text',
  patchPlaceholder: 'Paste a unified diff (diff -u) here, or drop a .diff file',
  openPatch: 'Open patch',
  openPatchTitle: 'Open a .diff or .patch file',
  apply: 'Apply to original',
  applyKeyHint: 'Ctrl+Enter applies the patch.',
  applied: {
    one: 'Applied {n} hunk. The result is now the changed text.',
    other: 'Applied {n} hunks. The result is now the changed text.',
  },
  resultTitle: 'Result',
  failingHunk: 'Failing hunk',
  needPatch: 'Paste a patch first.',
  errHunkFailed: 'Hunk {hunk} of {total} (patch line {line}) does not match the original text.',
  errNoHunks: 'No hunks found. A unified diff has lines like "@@ -1,3 +1,4 @@".',
  errBadHeader: 'Line {line}: this hunk header cannot be read.',
  errBadLine: 'Line {line}: this line does not belong in a unified diff.',
  errTooManyLines: 'Line {line}: the hunk has more lines than its header says.',
  errTruncated: 'Line {line}: the patch ends in the middle of a hunk.',
  errMultipleFiles: 'Line {line}: the patch changes a second file; only one file is supported.',
  errUnknown: 'The patch could not be applied.',
  fileLoaded: 'Opened {name}.',
  fileTooBig: '{name} is larger than {size} MB.',
  fileBinary: '{name} does not look like a text file.',
  fileFailed: '{name} could not be read.',
  cleared: 'Both texts were cleared.',
  undo: 'Undo',
  keysHint: 'Keys: N next change · P previous change',
  footerSource: 'Source on GitHub',
};

/** @type {Record<string, Entry>} */
const TR = {
  appTitle: 'Metin Farkı',
  tagline: 'İki metni satır, kelime ya da karakter düzeyinde karşılaştırın',
  clear: 'Temizle',
  clearTitle: 'İki metni de temizle',
  langSwitch: 'EN: İngilizceye geç',
  original: 'Orijinal',
  changed: 'Değiştirilmiş',
  leftPlaceholder: 'Orijinal metni yazın ya da yapıştırın veya buraya bir dosya bırakın',
  rightPlaceholder: 'Değiştirilmiş metni yazın ya da yapıştırın veya buraya bir dosya bırakın',
  openFile: 'Dosya aç',
  openLeftTitle: 'Orijinal metin olarak bir dosya aç',
  openRightTitle: 'Değiştirilmiş metin olarak bir dosya aç',
  dropHere: 'Açmak için dosyayı bırakın',
  lineCount: '{n} satır',
  swap: 'Yer değiştir',
  swapTitle: 'İki metnin yerini değiştir',
  optionsLabel: 'Karşılaştırma seçenekleri',
  compareBy: 'Karşılaştırma',
  modeLines: 'Satır',
  modeWords: 'Kelime',
  modeChars: 'Karakter',
  ignoreWhitespace: 'Boşlukları yok say',
  ignoreCase: 'Büyük/küçük harfi yok say',
  ignoreBlankLines: 'Boş satırları yok say',
  contextLines: 'Bağlam satırı',
  contextTitle: 'Yamada her değişikliğin çevresinde gösterilen değişmemiş satırlar',
  viewsLabel: 'Sonuç görünümleri',
  tabSplit: 'Yan yana',
  tabInline: 'Alt alta',
  tabPatch: 'Yama',
  tabApply: 'Yama uygula',
  statAdded: 'Eklenen',
  statRemoved: 'Silinen',
  statChanged: 'Değişen',
  statSimilarity: 'Benzerlik',
  statAddedTitle: 'Yalnız değiştirilmiş metinde olan satırlar',
  statRemovedTitle: 'Yalnız orijinal metinde olan satırlar',
  statChangedTitle: 'Düzenlenmiş satırlar',
  statSimilarityTitle: 'Değişmeyen karakterlerin oranı; değişen satırların değişmeyen kısımları da sayılır',
  percent: '%{value}',
  prevTitle: 'Önceki değişiklik (P)',
  nextTitle: 'Sonraki değişiklik (N)',
  changePosition: '{current} / {total}',
  changeCount: '{n} değişiklik',
  noChanges: 'Değişiklik yok',
  emptyTitle: 'Henüz karşılaştırılacak bir şey yok',
  emptyBody: 'Neyin değiştiğini görmek için iki tarafa da bir metin yazın, yapıştırın, açın ya da bırakın.',
  tryExample: 'Örneği dene',
  identical: 'İki metin birebir aynı.',
  noDifferences: 'Seçili seçeneklerle fark yok.',
  coarseNotice: 'Bazı değişiklikler ayrıntılı karşılaştırma için çok büyük; bu yüzden bir kısmı bütünüyle değişmiş olarak gösteriliyor.',
  patchTitle: 'Birleşik fark',
  hunkCount: '{n} parça',
  copy: 'Kopyala',
  download: '.diff indir',
  copied: 'Yama panoya kopyalandı.',
  copyFailed: 'Kopyalama engellendi. Yama seçili; elle kopyalayın.',
  downloaded: '{name} olarak kaydedildi.',
  noPatch: 'Yama yok: metinler arasında fark yok.',
  patchLabel: 'Orijinal metne uygulanacak yama',
  patchPlaceholder: 'Buraya birleşik bir fark (diff -u) yapıştırın ya da bir .diff dosyası bırakın',
  openPatch: 'Yama aç',
  openPatchTitle: '.diff ya da .patch dosyası aç',
  apply: 'Orijinale uygula',
  applyKeyHint: 'Ctrl+Enter yamayı uygular.',
  applied: '{n} parça uygulandı. Sonuç artık değiştirilmiş metin.',
  resultTitle: 'Sonuç',
  failingHunk: 'Uymayan parça',
  needPatch: 'Önce bir yama yapıştırın.',
  errHunkFailed: 'Yamanın {line}. satırındaki parça ({hunk}/{total}) orijinal metinle uyuşmuyor.',
  errNoHunks: 'Hiç parça bulunamadı. Birleşik farkta "@@ -1,3 +1,4 @@" gibi satırlar olur.',
  errBadHeader: '{line}. satır: bu parça başlığı okunamıyor.',
  errBadLine: '{line}. satır: bu satır birleşik farka ait değil.',
  errTooManyLines: '{line}. satır: parçada, başlığında yazandan fazla satır var.',
  errTruncated: '{line}. satır: yama bir parçanın ortasında bitiyor.',
  errMultipleFiles: '{line}. satır: yama ikinci bir dosyayı değiştiriyor; yalnız tek dosya desteklenir.',
  errUnknown: 'Yama uygulanamadı.',
  fileLoaded: '{name} açıldı.',
  fileTooBig: '{name}, {size} MB sınırından büyük.',
  fileBinary: '{name} bir metin dosyasına benzemiyor.',
  fileFailed: '{name} okunamadı.',
  cleared: 'İki metin de temizlendi.',
  undo: 'Geri al',
  keysHint: 'Tuşlar: N sonraki değişiklik · P önceki değişiklik',
  footerSource: "Kaynak kodu GitHub'da",
};

/** Every UI string by language. */
export const STRINGS = Object.freeze({ en: Object.freeze(EN), tr: Object.freeze(TR) });

/** String keys for the error codes of parseUnified and applyPatch. */
const ERROR_KEYS = Object.freeze({
  'hunk-failed': 'errHunkFailed',
  'no-hunks': 'errNoHunks',
  'bad-header': 'errBadHeader',
  'bad-line': 'errBadLine',
  'too-many-lines': 'errTooManyLines',
  truncated: 'errTruncated',
  'multiple-files': 'errMultipleFiles',
});

/**
 * @param {unknown} lang
 * @returns {Lang} lang when it is supported, otherwise the default language
 */
export function normalizeLanguage(lang) {
  return LANGUAGES.includes(lang) ? /** @type {Lang} */ (lang) : 'en';
}

/**
 * @param {Lang} lang
 * @returns {Lang} the language the toggle switches to
 */
export function otherLanguage(lang) {
  return normalizeLanguage(lang) === 'en' ? 'tr' : 'en';
}

/**
 * Looks up a string and fills in its "{name}" placeholders. Plural forms
 * are picked by the "n" parameter. Unknown keys come back unchanged.
 * @param {Lang} lang
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function translate(lang, key, params = {}) {
  const code = normalizeLanguage(lang);
  let entry = Object.hasOwn(STRINGS[code], key) ? STRINGS[code][key] : undefined;
  if (entry === undefined) return key;
  if (typeof entry !== 'string') entry = entry[new Intl.PluralRules(code).select(Number(params.n))] ?? entry.other;
  return entry.replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}

/**
 * @param {string} code an error code from parseUnified or applyPatch
 * @returns {string} the key of its message
 */
export function errorKey(code) {
  return Object.hasOwn(ERROR_KEYS, code) ? ERROR_KEYS[code] : 'errUnknown';
}

/**
 * Formats a percentage with at most one decimal, rounded down so that
 * anything short of 100 never shows as 100.
 * @param {Lang} lang
 * @param {number} value 0..100
 * @returns {string} "71.4%" in English, "%71,4" in Turkish
 */
export function formatPercent(lang, value) {
  const code = normalizeLanguage(lang);
  const floored = Math.floor(value * 10 + 1e-9) / 10;
  const number = new Intl.NumberFormat(code, { maximumFractionDigits: 1 }).format(floored);
  return translate(code, 'percent', { value: number });
}
