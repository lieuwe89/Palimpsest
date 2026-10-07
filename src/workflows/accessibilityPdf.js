import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFBool } from 'pdf-lib';
import { pdfjsLib } from '../utils/pdfWorker.js';
import { showNotification } from '../utils/notifications.js';
import { bindPdfDropzone, downloadBytes } from '../utils/dropzone.js';

const N = (name) => PDFName.of(name);

// Counts /Figure structure elements without /Alt by walking the structure tree.
function countFiguresWithoutAlt(context, root) {
  let figures = 0;
  let missing = 0;
  const seen = new Set();
  const visit = (node) => {
    if (node instanceof PDFRef) {
      if (seen.has(node.toString())) return;
      seen.add(node.toString());
      node = context.lookup(node);
    }
    if (node instanceof PDFArray) {
      for (let i = 0; i < node.size(); i++) visit(node.get(i));
    } else if (node instanceof PDFDict) {
      if (node.get(N('S')) === N('Figure')) {
        figures++;
        if (!node.has(N('Alt'))) missing++;
      }
      const kids = node.get(N('K'));
      if (kids) visit(kids);
    }
  };
  visit(root.get(N('K')));
  return { figures, missing };
}

export async function checkAccessibility(bytes) {
  const doc = await PDFDocument.load(bytes.slice(0), { updateMetadata: false });
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const catalog = doc.catalog;
  const pageCount = doc.getPageCount();
  const results = [];
  const add = (status, title, detail) => results.push({ status, title, detail });

  // 1. Text layer
  const noText = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    if (!content.items.some(item => item.str.trim())) noText.push(i);
  }
  pdf.destroy();
  if (noText.length === 0) add('pass', 'Text layer', 'Every page has real text that can be read aloud and searched.');
  else add('fail', 'Text layer', `${noText.length} of ${pageCount} page(s) contain only images (e.g. scans), so screen readers find nothing. Run OCR PDF first.`);

  // 2. Tags
  const markInfo = catalog.lookupMaybe(N('MarkInfo'), PDFDict);
  const structRoot = catalog.lookupMaybe(N('StructTreeRoot'), PDFDict);
  const tagged = markInfo?.get(N('Marked')) === PDFBool.True && !!structRoot;
  if (tagged) add('pass', 'Tagged PDF', 'The document has a structure tree (headings, paragraphs, reading order).');
  else add('fail', 'Tagged PDF', 'No structure tags, so assistive technology cannot tell headings, lists, tables or reading order apart. Palimpsest cannot add tags; export a tagged PDF from Word/LibreOffice or use Acrobat\'s "Autotag".');

  // 3. Title + shown in the window
  const title = doc.getTitle()?.trim();
  if (title) add('pass', 'Document title', `"${title}"`);
  else add('fail', 'Document title', 'No title set. Fix it with the controls above.');
  const displayTitle = catalog.lookupMaybe(N('ViewerPreferences'), PDFDict)?.get(N('DisplayDocTitle')) === PDFBool.True;
  if (displayTitle) add('pass', 'Show title in window', 'Viewers show the title instead of the file name.');
  else add('warn', 'Show title in window', 'Viewers show the file name instead of the title. Fix it with the controls above.');

  // 4. Language
  const langText = catalog.lookup(N('Lang'))?.decodeText?.().trim();
  if (langText) add('pass', 'Document language', langText);
  else add('fail', 'Document language', 'No language set, so screen readers may pronounce the text wrongly. Fix it with the controls above.');

  // 5. Bookmarks
  const hasOutlines = !!catalog.lookupMaybe(N('Outlines'), PDFDict)?.get(N('First'));
  if (hasOutlines) add('pass', 'Bookmarks', 'Present, so readers can jump between sections.');
  else if (pageCount > 20) add('warn', 'Bookmarks', `None, in a ${pageCount}-page document. Long documents need bookmarks for navigation.`);
  else add('pass', 'Bookmarks', 'None, which is fine for a short document.');

  // 6. Alt text (only meaningful when tagged)
  if (tagged) {
    const { figures, missing } = countFiguresWithoutAlt(doc.context, structRoot);
    if (missing) add('fail', 'Alternative text', `${missing} of ${figures} figure(s) have no alt text.`);
    else add('pass', 'Alternative text', figures ? `All ${figures} figure(s) have alt text.` : 'No tagged figures.');
  }

  // 7. Tab order on pages with links or form fields
  const badTabs = doc.getPages().filter(p => p.node.get(N('Annots')) && p.node.get(N('Tabs')) !== N('S')).length;
  if (badTabs) add('warn', 'Tab order', `${badTabs} page(s) with links or fields don't follow the document structure when tabbing. Fix it with the controls above.`);

  // 8. Form field descriptions
  let fields = [];
  try {
    fields = doc.getForm().getFields();
  } catch { /* malformed AcroForm: nothing we can report on */ }
  if (fields.length) {
    const missing = fields.filter(f => !f.acroField.dict.has(N('TU'))).length;
    if (missing) add('warn', 'Form field descriptions', `${missing} of ${fields.length} field(s) have no description (tooltip) for screen readers.`);
    else add('pass', 'Form field descriptions', `All ${fields.length} field(s) are described.`);
  }

  return { results, title, lang: langText };
}

export function initAccessibilityPdf() {
  const dropzone = document.getElementById('a11y-dropzone');
  const fileInput = document.getElementById('a11y-file-input');
  const report = document.getElementById('a11y-report');
  const titleInput = document.getElementById('a11y-title');
  const langSelect = document.getElementById('a11y-lang');
  const fixBtn = document.getElementById('a11y-fix-btn');

  let file = null;

  // Titles and language come from an untrusted PDF: set via textContent only.
  const render = (results) => {
    report.replaceChildren(...results.map(({ status, title, detail }) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      const badge = document.createElement('div');
      badge.className = `check-badge ${status}`;
      badge.textContent = { pass: 'Pass', fail: 'Fail', warn: 'Check' }[status];
      const info = document.createElement('div');
      info.className = 'file-info';
      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = title;
      const meta = document.createElement('div');
      meta.className = 'file-meta';
      meta.textContent = detail;
      info.append(name, meta);
      el.append(badge, info);
      return el;
    }));
  };

  const run = async (bytes) => {
    report.replaceChildren();
    const { results, title, lang } = await checkAccessibility(bytes);
    render(results);
    titleInput.value = title || '';
    if (lang && ![...langSelect.options].some(o => o.value === lang)) langSelect.add(new Option(lang, lang));
    langSelect.value = lang || 'nl-NL';
  };

  bindPdfDropzone(dropzone, fileInput, async (pdf) => {
    try {
      fixBtn.disabled = true;
      await run(new Uint8Array(await pdf.arrayBuffer()));
      file = pdf;
      fixBtn.disabled = false;
    } catch (err) {
      if (err.message && err.message.includes('encrypted')) {
        showNotification(`Cannot check ${pdf.name}: PDF is encrypted. Please unlock it first.`, 'error');
      } else {
        showNotification(`Error checking ${pdf.name}: ${err.message || err}`, 'error');
      }
    }
  });

  fixBtn.addEventListener('click', async () => {
    if (!file) return;
    try {
      fixBtn.disabled = true;
      const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      const title = titleInput.value.trim();
      if (title) {
        doc.setTitle(title);
        // Set by hand: pdf-lib 1.17 ignores setTitle's showInWindow option.
        let prefs = doc.catalog.lookupMaybe(N('ViewerPreferences'), PDFDict);
        if (!prefs) {
          prefs = doc.context.obj({});
          doc.catalog.set(N('ViewerPreferences'), prefs);
        }
        prefs.set(N('DisplayDocTitle'), PDFBool.True);
      }
      doc.setLanguage(langSelect.value);
      for (const page of doc.getPages()) {
        if (page.node.get(N('Annots'))) page.node.set(N('Tabs'), N('S'));
      }
      const bytes = await doc.save({ useObjectStreams: true });
      downloadBytes(bytes, file.name.replace(/\.pdf$/i, '') + '-accessible.pdf');
      await run(bytes); // show the report for the fixed file
      showNotification('Fixes applied. Remaining items need the source document or Acrobat.', 'success');
    } catch (err) {
      showNotification(`Error applying fixes: ${err.message || err}`, 'error');
    } finally {
      fixBtn.disabled = !file;
    }
  });
}
