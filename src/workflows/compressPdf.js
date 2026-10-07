import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRawStream, PDFRef, PDFNumber } from 'pdf-lib';
import { showNotification } from '../utils/notifications.js';
import { bindPdfDropzone, downloadBytes, renderFileItem } from '../utils/dropzone.js';

export const PRESETS = {
  small: { dpi: 120, quality: 0.65 },
  standard: { dpi: 150, quality: 0.7 },
  high: { dpi: 200, quality: 0.8 },
};

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Only plain JPEG images in RGB/Gray are recompressed; anything else is left untouched.
function isRecompressibleJpeg(stream, context) {
  const dict = stream.dict;
  if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) return false;
  if (dict.has(PDFName.of('Decode')) || dict.has(PDFName.of('ImageMask'))) return false;

  let filter = dict.lookup(PDFName.of('Filter'));
  if (filter instanceof PDFArray) filter = filter.size() === 1 ? filter.lookup(0) : null;
  if (filter !== PDFName.of('DCTDecode')) return false;

  const cs = dict.lookup(PDFName.of('ColorSpace'));
  if (cs === PDFName.of('DeviceRGB') || cs === PDFName.of('DeviceGray')) return true;
  if (cs instanceof PDFArray && cs.lookup(0) === PDFName.of('ICCBased')) {
    const n = context.lookup(cs.get(1)).dict.lookup(PDFName.of('N'));
    return n instanceof PDFNumber && (n.asNumber() === 1 || n.asNumber() === 3);
  }
  return false;
}

async function recompressJpeg(bytes, width, height, quality) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { imageOrientation: 'none' });
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function compressPdf(buffer, { dpi, quality }, onProgress = () => {}) {
  const doc = await PDFDocument.load(buffer);
  const pages = doc.getPages();
  const done = new Set();
  const jobs = [];

  for (const page of pages) {
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) continue;

    // ponytail: assumes an image can fill the whole page, so DPI is never underestimated.
    // Small images on a page keep more pixels than needed; parse the content stream's CTM if that matters.
    const { width: pw, height: ph } = page.getSize();
    const maxW = Math.round((pw / 72) * dpi);
    const maxH = Math.round((ph / 72) * dpi);

    for (const [, ref] of xobjects.entries()) {
      if (!(ref instanceof PDFRef) || done.has(ref.toString())) continue;
      done.add(ref.toString());
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream) || !isRecompressibleJpeg(stream, doc.context)) continue;

      const w = stream.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber();
      const h = stream.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber();
      const scale = Math.min(1, Math.max(maxW / w, maxH / h));
      const nw = Math.max(1, Math.round(w * scale));
      const nh = Math.max(1, Math.round(h * scale));
      jobs.push({ ref, stream, nw, nh });
    }
  }

  const recompress = async ({ ref, stream, nw, nh }) => {
    const bytes = await recompressJpeg(stream.contents, nw, nh, quality);
    if (bytes.length >= stream.contents.length) return;

    const dict = stream.dict;
    dict.set(PDFName.of('Width'), PDFNumber.of(nw));
    dict.set(PDFName.of('Height'), PDFNumber.of(nh));
    dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB')); // canvas always encodes RGB
    dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
    dict.delete(PDFName.of('DecodeParms'));
    doc.context.assign(ref, PDFRawStream.of(dict, bytes));
  };

  // Decode/encode run off the main thread, so a few in flight at once is much faster than one by one.
  let next = 0;
  let finished = 0;
  const worker = async () => {
    while (next < jobs.length) {
      await recompress(jobs[next++]);
      onProgress(++finished, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  return doc.save({ useObjectStreams: true });
}

export function initCompressPdf() {
  const dropzone = document.getElementById('compress-dropzone');
  const fileInput = document.getElementById('compress-file-input');
  const info = document.getElementById('compress-info');
  const presetSelect = document.getElementById('compress-preset');
  const downloadBtn = document.getElementById('compress-download-btn');

  let file = null;

  const renderInfo = (meta) => renderFileItem(info, file, meta, () => {
    file = null;
    renderInfo();
    downloadBtn.disabled = true;
  });

  bindPdfDropzone(dropzone, fileInput, (pdf) => {
    file = pdf;
    renderInfo(`Original size: ${formatSize(file.size)}`);
    downloadBtn.disabled = false;
  });

  downloadBtn.addEventListener('click', async () => {
    if (!file) return;
    const original = file;
    try {
      downloadBtn.disabled = true;
      presetSelect.disabled = true;
      const pdfBytes = await compressPdf(
        await original.arrayBuffer(),
        PRESETS[presetSelect.value],
        (n, total) => { downloadBtn.textContent = `Image ${n}/${total}`; }
      );

      if (pdfBytes.length >= original.size) {
        renderInfo(`Original size: ${formatSize(original.size)} — already as small as this preset gets`);
        showNotification('Could not make this PDF smaller with this preset.', 'info');
        return;
      }

      const pct = Math.round((pdfBytes.length / original.size) * 100);
      renderInfo(`${formatSize(original.size)} → ${formatSize(pdfBytes.length)} (${pct}%)`);

      downloadBytes(pdfBytes, original.name.replace(/\.pdf$/i, '') + '-compressed.pdf');
      showNotification('PDF compressed successfully!', 'success');
    } catch (err) {
      if (err.message && err.message.includes('encrypted')) {
        showNotification(`Cannot compress ${original.name}: PDF is encrypted. Use Unlock PDF first.`, 'error');
      } else {
        showNotification(`Error compressing PDF: ${err.message || err}`, 'error');
      }
    } finally {
      downloadBtn.disabled = !file;
      presetSelect.disabled = false;
      downloadBtn.textContent = 'Compress & Download';
    }
  });
}
