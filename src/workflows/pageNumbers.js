import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { showNotification } from '../utils/notifications.js';
import { bindPdfDropzone, downloadBytes, renderFileItem } from '../utils/dropzone.js';

const FONT_SIZE = 11;
const MARGIN = 28; // pt from the page edge (~1 cm)

const FORMATS = {
  plain: (n) => `${n}`,
  ofTotal: (n, total) => `${n} / ${total}`,
  page: (n, total) => `Page ${n} of ${total}`,
};

// Maps a point in the page as displayed (after /Rotate) back to PDF user space.
function toUserSpace(rotation, box, vx, vy) {
  const { x, y, width: w, height: h } = box;
  switch (rotation) {
    case 90: return [x + w - vy, y + vx];
    case 180: return [x + w - vx, y + h - vy];
    case 270: return [x + vy, y + h - vx];
    default: return [x + vx, y + vy];
  }
}

export async function addPageNumbers(bytes, { position, format, start, skipFirst }) {
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const numbered = skipFirst ? pages.slice(1) : pages;
  const total = numbered.length + start - 1;
  const [vertical, horizontal] = position.split('-');

  numbered.forEach((page, i) => {
    const text = FORMATS[format](start + i, total);
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const box = page.getCropBox();
    const sideways = rotation === 90 || rotation === 270;
    const vw = sideways ? box.height : box.width;
    const vh = sideways ? box.width : box.height;
    const textWidth = font.widthOfTextAtSize(text, FONT_SIZE);

    const vx = horizontal === 'left' ? MARGIN : horizontal === 'right' ? vw - MARGIN - textWidth : (vw - textWidth) / 2;
    const vy = vertical === 'top' ? vh - MARGIN - FONT_SIZE : MARGIN;
    const [x, y] = toUserSpace(rotation, box, vx, vy);
    // ponytail: always black; scans with dark margins would need a colour option or a white backing box.
    page.drawText(text, { x, y, size: FONT_SIZE, font, color: rgb(0, 0, 0), rotate: degrees(rotation) });
  });

  return doc.save({ useObjectStreams: true });
}

export function initPageNumbers() {
  const dropzone = document.getElementById('pagenum-dropzone');
  const fileInput = document.getElementById('pagenum-file-input');
  const info = document.getElementById('pagenum-info');
  const positionSelect = document.getElementById('pagenum-position');
  const formatSelect = document.getElementById('pagenum-format');
  const startInput = document.getElementById('pagenum-start');
  const skipFirstInput = document.getElementById('pagenum-skip-first');
  const downloadBtn = document.getElementById('pagenum-download-btn');

  let file = null;

  const renderInfo = (meta) => renderFileItem(info, file, meta, () => {
    file = null;
    renderInfo();
    downloadBtn.disabled = true;
  });

  bindPdfDropzone(dropzone, fileInput, (pdf) => {
    file = pdf;
    renderInfo('Ready to number');
    downloadBtn.disabled = false;
  });

  downloadBtn.addEventListener('click', async () => {
    if (!file) return;
    const original = file;
    try {
      downloadBtn.disabled = true;
      const bytes = await addPageNumbers(await original.arrayBuffer(), {
        position: positionSelect.value,
        format: formatSelect.value,
        start: Math.max(1, parseInt(startInput.value, 10) || 1),
        skipFirst: skipFirstInput.checked,
      });
      downloadBytes(bytes, original.name.replace(/\.pdf$/i, '') + '-numbered.pdf');
      showNotification('Page numbers added!', 'success');
    } catch (err) {
      if (err.message && err.message.includes('encrypted')) {
        showNotification(`Cannot number ${original.name}: PDF is encrypted. Use Unlock PDF first.`, 'error');
      } else {
        showNotification(`Error adding page numbers: ${err.message || err}`, 'error');
      }
    } finally {
      downloadBtn.disabled = !file;
    }
  });
}
