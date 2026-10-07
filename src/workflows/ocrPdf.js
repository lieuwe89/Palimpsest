import { createScheduler, createWorker } from 'tesseract.js';
import {
  PDFDocument, StandardFonts, TextRenderingMode,
  pushGraphicsState, popGraphicsState, beginText, endText,
  setFontAndSize, setTextRenderingMode, setCharacterSqueeze, setTextMatrix, showText,
} from 'pdf-lib';
import { pdfjsLib } from '../utils/pdfWorker.js';
import { showNotification } from '../utils/notifications.js';
import { bindPdfDropzone, downloadBytes } from '../utils/dropzone.js';

const RENDER_DPI = 300;
// Self-hosted (see scripts/copy-tesseract.mjs). Absolute, because the worker resolves these from a blob: URL.
const TESSERACT_BASE = new URL(`${import.meta.env.BASE_URL}tesseract/`, location.href).href;

async function createOcrScheduler(lang, size) {
  const scheduler = createScheduler();
  const workers = await Promise.all(Array.from({ length: size }, () => createWorker(lang, undefined, {
    workerPath: `${TESSERACT_BASE}worker.min.js`,
    corePath: TESSERACT_BASE,
    langPath: TESSERACT_BASE,
  })));
  workers.forEach(w => scheduler.addWorker(w));
  return scheduler;
}

// Writes each recognised word as invisible text over its position on the page,
// stretched horizontally (Tz) to match the word's width so selection lines up with the image.
function addTextLayer(page, font, fontKey, blocks, viewport) {
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];

  // Positions come from each word's own bbox: Tesseract's line baselines are unreliable on
  // curved phone photos of book pages, where neighbouring lines get merged.
  for (const block of blocks) for (const para of block.paragraphs) for (const line of para.lines) {
    for (const word of line.words) {
      const text = word.text.trim();
      const { x0, y0, x1, y1 } = word.bbox;
      if (!text || y1 <= y0) continue;
      let encoded;
      try {
        encoded = font.encodeText(text);
      } catch {
        continue; // character outside WinAnsi (e.g. ligatures); skipping one word beats failing the page
      }
      // Font size = word height; baseline sits at Helvetica's descender (~0.2 em) above the bottom.
      const fontSize = (y1 - y0) / viewport.scale;
      const baseline = y1 - (y1 - y0) * 0.2;
      const [px0, py0] = viewport.convertToPdfPoint(x0, baseline);
      const [px1, py1] = viewport.convertToPdfPoint(x1, baseline);
      const width = Math.hypot(px1 - px0, py1 - py0);
      const natural = font.widthOfTextAtSize(text, fontSize);
      if (!width || !natural) continue;
      const cos = (px1 - px0) / width;
      const sin = (py1 - py0) / width;
      ops.push(
        setFontAndSize(fontKey, fontSize),
        setCharacterSqueeze((width / natural) * 100),
        setTextMatrix(cos, sin, -sin, cos, px0, py0),
        showText(encoded),
      );
    }
  }

  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
}

export async function ocrPdf(buffer, lang, onProgress = () => {}) {
  // pdf-lib and pdf.js both detach the buffer they get, so each needs its own copy.
  const libBuffer = buffer.slice(0);
  const jsBuffer = buffer.slice(0);
  const doc = await PDFDocument.load(libBuffer);
  const pdf = await pdfjsLib.getDocument({ data: jsBuffer }).promise;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  // Pages that already have a text layer are left alone.
  const todo = [];
  for (let i = 0; i < pages.length; i++) {
    const content = await (await pdf.getPage(i + 1)).getTextContent();
    if (!content.items.some(item => item.str.trim())) todo.push(i);
  }
  if (todo.length === 0) return { bytes: null, ocrPages: 0, skipped: pages.length };

  const size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const scheduler = await createOcrScheduler(lang, size);
  try {
    let next = 0;
    let finished = 0;
    onProgress(0, todo.length);
    const run = async () => {
      while (next < todo.length) {
        const i = todo[next++];
        const pdfPage = await pdf.getPage(i + 1);
        const viewport = pdfPage.getViewport({ scale: RENDER_DPI / 72 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        // 'print' intent skips requestAnimationFrame, which stalls when the tab is in the background.
        await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise;
        const { data } = await scheduler.addJob('recognize', canvas, {}, { blocks: true, text: false });
        canvas.width = canvas.height = 0; // release the bitmap memory right away

        const page = pages[i];
        const fontKey = page.node.newFontDictionary('F-OCR', font.ref);
        addTextLayer(page, font, fontKey, data.blocks || [], viewport);
        onProgress(++finished, todo.length);
      }
    };
    await Promise.all(Array.from({ length: size }, run));
  } finally {
    await scheduler.terminate();
    pdf.destroy();
  }

  return { bytes: await doc.save({ useObjectStreams: true }), ocrPages: todo.length, skipped: pages.length - todo.length };
}

export function initOcrPdf() {
  const dropzone = document.getElementById('ocr-dropzone');
  const fileInput = document.getElementById('ocr-file-input');
  const info = document.getElementById('ocr-info');
  const langSelect = document.getElementById('ocr-lang');
  const downloadBtn = document.getElementById('ocr-download-btn');

  let file = null;

  const renderInfo = (meta) => {
    if (!file) {
      info.innerHTML = '';
      return;
    }
    info.innerHTML = `
      <div class="list-item">
        <div class="file-info">
          <div class="file-name" title="${file.name}">${file.name}</div>
          <div class="file-meta">${meta}</div>
        </div>
        <button class="remove-btn" title="Remove file">&times;</button>
      </div>
    `;
    info.querySelector('.remove-btn').addEventListener('click', () => {
      file = null;
      renderInfo();
      downloadBtn.disabled = true;
    });
  };

  bindPdfDropzone(dropzone, fileInput, (pdf) => {
    file = pdf;
    renderInfo('Ready for text recognition');
    downloadBtn.disabled = false;
  });

  downloadBtn.addEventListener('click', async () => {
    if (!file) return;
    const original = file;
    try {
      downloadBtn.disabled = true;
      langSelect.disabled = true;
      downloadBtn.textContent = 'Loading OCR…';
      const started = performance.now();
      const { bytes, ocrPages, skipped } = await ocrPdf(
        await original.arrayBuffer(),
        langSelect.value,
        (n, total) => {
          downloadBtn.textContent = `Page ${n}/${total}`;
          renderInfo(`Recognising text… ${n} of ${total} page(s) done`);
        }
      );

      if (!bytes) {
        renderInfo('Every page already has a text layer — nothing to do');
        showNotification('This PDF already contains text.', 'info');
        return;
      }

      const secs = Math.round((performance.now() - started) / 1000);
      renderInfo(`Text added to ${ocrPages} page(s) in ${secs}s` + (skipped ? `, ${skipped} already had text` : ''));

      downloadBytes(bytes, original.name.replace(/\.pdf$/i, '') + '-ocr.pdf');
      showNotification('Text recognition complete!', 'success');
    } catch (err) {
      if (err.message && err.message.includes('encrypted')) {
        showNotification(`Cannot process ${original.name}: PDF is encrypted. Please unlock it first.`, 'error');
      } else {
        showNotification(`Error during text recognition: ${err.message || err}`, 'error');
      }
    } finally {
      downloadBtn.disabled = !file;
      langSelect.disabled = false;
      downloadBtn.textContent = 'Recognise & Download';
    }
  });
}
