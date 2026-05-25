import Sortable from 'sortablejs';
import { PDFDocument, degrees } from 'pdf-lib';
import { pdfjsLib } from '../utils/pdfWorker.js';
import * as fflate from 'fflate';
import { showNotification } from '../utils/notifications.js';

export function initEditPdf() {
  const dropzone = document.getElementById('edit-dropzone');
  const fileInput = document.getElementById('edit-file-input');
  const workspace = document.getElementById('edit-workspace');
  const thumbnailsGrid = document.getElementById('edit-thumbnails');
  
  // Toolbar buttons
  const btnRotate = document.getElementById('edit-rotate-btn');
  const btnSpread = document.getElementById('edit-spread-btn');
  const btnSplit = document.getElementById('edit-split-btn');
  const btnExportImg = document.getElementById('edit-export-img-btn');
  const btnDownload = document.getElementById('edit-download-btn');
  const btnClear = document.getElementById('edit-clear-btn');
  
  // Split Panel
  const splitPanel = document.getElementById('split-results-panel');
  const splitList = document.getElementById('split-chunks-list');
  const splitClosePanelBtn = document.getElementById('split-close-panel-btn');

  let currentFile = null;
  let pdfDoc = null;
  let pages = []; // { id, originalIndex, pdfjsPage, rotation }
  let lastSelectedIndex = -1;
  let sortableInstance = null;

  const loadPdf = async (file) => {
    try {
      dropzone.classList.add('hidden');
      workspace.classList.remove('hidden');
      thumbnailsGrid.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
      
      currentFile = file;
      const arrayBuffer = await file.arrayBuffer();
      const pdfLibData = new Uint8Array(arrayBuffer.slice(0));
      const pdfJsData = new Uint8Array(arrayBuffer.slice(0));
      
      // Load with pdf-lib for mutations
      pdfDoc = await PDFDocument.load(pdfLibData);
      const pageCount = pdfDoc.getPageCount();

      // Load with pdf.js for rendering
      const loadingTask = pdfjsLib.getDocument({ data: pdfJsData });
      const pdfJsDoc = await loadingTask.promise;

      pages = [];
      thumbnailsGrid.innerHTML = '';
      
      for (let i = 1; i <= pageCount; i++) {
        const pdfjsPage = await pdfJsDoc.getPage(i);
        const id = `page-${i}-${Date.now()}`;
        pages.push({
          id,
          originalIndex: i - 1,
          pdfjsPage,
          rotation: 0,
          selected: false,
          splitActive: false,
          spreadHalf: null
        });
      }

      await renderThumbnails();
      initSortable();
      updateUI();
    } catch (err) {
      console.error('Error loading PDF:', err);
      dropzone.classList.remove('hidden');
      workspace.classList.add('hidden');
      if (err.message && err.message.includes('encrypted')) {
        showNotification('This PDF is encrypted. Please unlock it (e.g., "Save to PDF" in your browser) before editing.', 'error');
      } else {
        showNotification(`Error: ${err.message || err}`, 'error');
      }
    }
  };

  const renderThumbnails = async () => {
    thumbnailsGrid.innerHTML = '';
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const el = document.createElement('div');
      el.className = `thumbnail-card ${page.selected ? 'selected' : ''}`;
      el.dataset.id = page.id;
      el.innerHTML = `
        <div class="thumbnail-canvas-container">
          <canvas id="canvas-${page.id}" style="max-height: 200px; width: auto; display: block; margin: 0 auto;"></canvas>
        </div>
        <div class="thumbnail-label">Page ${i + 1}</div>
      `;
      
      const splitHandle = document.createElement('div');
      splitHandle.className = `split-handle ${page.splitActive ? 'active' : ''}`;
      splitHandle.title = "Split after this page";
      splitHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        page.splitActive = !page.splitActive;
        splitHandle.classList.toggle('active');
        updateUI();
      });
      el.appendChild(splitHandle);
      
      el.addEventListener('click', (e) => {
        if (e.shiftKey && lastSelectedIndex !== -1) {
          const start = Math.min(lastSelectedIndex, i);
          const end = Math.max(lastSelectedIndex, i);
          for (let j = start; j <= end; j++) pages[j].selected = true;
        } else {
          page.selected = !page.selected;
          lastSelectedIndex = i;
        }
        renderThumbnailsSyncState();
        updateUI();
      });

      thumbnailsGrid.appendChild(el);
      
      // Render canvas
      const canvas = document.getElementById(`canvas-${page.id}`);
      if (canvas) await renderCanvas(page, canvas);
    }
  };

  const renderThumbnailsSyncState = () => {
    Array.from(thumbnailsGrid.children).forEach((el, i) => {
      if (pages[i].selected) el.classList.add('selected');
      else el.classList.remove('selected');
    });
  };

  const renderCanvas = async (pageObj, canvas) => {
    if (!pageObj.spreadHalf) {
      const viewport = pageObj.pdfjsPage.getViewport({ scale: 1, rotation: pageObj.rotation });
      const scale = 200 / viewport.width;
      const scaledViewport = pageObj.pdfjsPage.getViewport({ scale, rotation: pageObj.rotation });
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;
      await pageObj.pdfjsPage.render({
        canvasContext: canvas.getContext('2d'),
        viewport: scaledViewport
      }).promise;
      return;
    }

    // Half-page: render native page to temp, crop half into visible canvas, then rotate visible if needed.
    const nativeFullVp = pageObj.pdfjsPage.getViewport({ scale: 1, rotation: 0 });
    const scale = 200 / nativeFullVp.width;
    const nativeVp = pageObj.pdfjsPage.getViewport({ scale, rotation: 0 });

    const temp = document.createElement('canvas');
    temp.width = nativeVp.width;
    temp.height = nativeVp.height;
    await pageObj.pdfjsPage.render({
      canvasContext: temp.getContext('2d'),
      viewport: nativeVp
    }).promise;

    const horizontal = pageObj.spreadHalf === 'left' || pageObj.spreadHalf === 'right';
    const halfW = horizontal ? nativeVp.width / 2 : nativeVp.width;
    const halfH = horizontal ? nativeVp.height : nativeVp.height / 2;
    const sx = pageObj.spreadHalf === 'right' ? nativeVp.width / 2 : 0;
    // pdf.js canvas y-axis grows down; visual "top half" = upper pixels = sy=0
    const sy = pageObj.spreadHalf === 'bottom' ? nativeVp.height / 2 : 0;

    // Apply rotation visually via CSS transform won't change canvas dims used by layout.
    // Render rotated bitmap directly: pick output canvas dims based on rotation.
    const rot = ((pageObj.rotation % 360) + 360) % 360;
    const rotated = rot === 90 || rot === 270;
    canvas.width = rotated ? halfH : halfW;
    canvas.height = rotated ? halfW : halfH;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(temp, sx, sy, halfW, halfH, -halfW / 2, -halfH / 2, halfW, halfH);
    ctx.restore();
  };

  const initSortable = () => {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(thumbnailsGrid, {
      animation: 150,
      onEnd: (evt) => {
        const itemEl = pages.splice(evt.oldIndex, 1)[0];
        pages.splice(evt.newIndex, 0, itemEl);
        // update labels
        Array.from(thumbnailsGrid.children).forEach((el, i) => {
          el.querySelector('.thumbnail-label').textContent = `Page ${i + 1}`;
        });
        lastSelectedIndex = -1;
      }
    });
  };

  const updateUI = () => {
    const hasSelection = pages.some(p => p.selected);
    const hasSpreadCandidate = pages.some(p => p.selected && p.spreadHalf === null);
    const hasSplit = pages.some(p => p.splitActive);
    const totalPages = pages.length;
    btnRotate.disabled = !hasSelection;
    btnSpread.disabled = !hasSpreadCandidate;
    btnSpread.title = !hasSpreadCandidate
      ? "Select unsplit pages first"
      : "Split each selected page into two at the midpoint";
    btnSplit.disabled = !hasSplit;
    btnSplit.title = !hasSplit ? "Select a split marker between pages" : "";
    btnExportImg.disabled = totalPages === 0;
    btnDownload.disabled = totalPages === 0;
  };

  // Drag and drop handlers
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) loadPdf(e.target.files[0]);
    e.target.value = ''; // reset
  });
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files[0].type !== 'application/pdf') {
        showNotification('Expected a PDF file.', 'error');
        return;
      }
      loadPdf(e.dataTransfer.files[0]);
    }
  });

  btnClear.addEventListener('click', () => {
    currentFile = null;
    pdfDoc = null;
    pages = [];
    thumbnailsGrid.innerHTML = '';
    splitPanel.classList.add('hidden');
    workspace.classList.add('hidden');
    dropzone.classList.remove('hidden');
  });
  
  splitClosePanelBtn.addEventListener('click', () => {
    splitPanel.classList.add('hidden');
  });

  // Actions
  btnRotate.addEventListener('click', async () => {
    for (const page of pages) {
      if (page.selected) {
        page.rotation = (page.rotation + 90) % 360;
        const canvas = document.getElementById(`canvas-${page.id}`);
        if (canvas) await renderCanvas(page, canvas);
      }
    }
  });

  btnSpread.addEventListener('click', async () => {
    try {
      btnSpread.innerHTML = '<div class="spinner"></div>';
      const next = [];
      let anySplit = false;
      for (const page of pages) {
        if (!page.selected || page.spreadHalf !== null) {
          next.push(page);
          continue;
        }
        const native = page.pdfjsPage.getViewport({ scale: 1, rotation: 0 });
        const landscape = native.width > native.height;
        const halves = landscape ? ['left', 'right'] : ['top', 'bottom'];
        for (const half of halves) {
          next.push({
            ...page,
            id: `page-half-${half}-${Date.now()}-${Math.random()}`,
            rotation: 0,
            selected: false,
            splitActive: false,
            spreadHalf: half
          });
        }
        anySplit = true;
      }
      if (!anySplit) {
        showNotification('Selected pages are already split halves.', 'info');
        return;
      }
      pages = next;
      lastSelectedIndex = -1;
      await renderThumbnails();
      initSortable();
      updateUI();
    } catch (err) {
      console.error('Error splitting spread:', err);
      showNotification('Error splitting spread pages.', 'error');
    } finally {
      btnSpread.innerHTML = 'Split Spread';
    }
  });

  // Append one source page (whole or spread-half) onto targetDoc, sourced from sourceDoc.
  const appendSourcePage = async (targetDoc, sourceDoc, sourcePage) => {
    if (!sourcePage.spreadHalf) {
      const [copied] = await targetDoc.copyPages(sourceDoc, [sourcePage.originalIndex]);
      if (sourcePage.rotation !== 0) {
        const currentRot = copied.getRotation().angle;
        copied.setRotation(degrees(currentRot + sourcePage.rotation));
      }
      targetDoc.addPage(copied);
      return;
    }
    const srcPage = sourceDoc.getPage(sourcePage.originalIndex);
    const srcW = srcPage.getWidth();
    const srcH = srcPage.getHeight();
    const bboxes = {
      left:   { left: 0,        bottom: 0,        right: srcW / 2, top: srcH },
      right:  { left: srcW / 2, bottom: 0,        right: srcW,     top: srcH },
      top:    { left: 0,        bottom: srcH / 2, right: srcW,     top: srcH },
      bottom: { left: 0,        bottom: 0,        right: srcW,     top: srcH / 2 }
    };
    const halfDims = {
      left:   [srcW / 2, srcH],
      right:  [srcW / 2, srcH],
      top:    [srcW,     srcH / 2],
      bottom: [srcW,     srcH / 2]
    };
    const embedded = await targetDoc.embedPage(srcPage, bboxes[sourcePage.spreadHalf]);
    const [w, h] = halfDims[sourcePage.spreadHalf];
    const newPage = targetDoc.addPage([w, h]);
    newPage.drawPage(embedded, { x: 0, y: 0, width: w, height: h });
    if (sourcePage.rotation !== 0) {
      newPage.setRotation(degrees(sourcePage.rotation));
    }
  };

  const generateMutatedDoc = async () => {
    const newDoc = await PDFDocument.create();
    const pagesToCompile = pages.some(p => p.selected) ? pages.filter(p => p.selected) : pages;
    for (const sp of pagesToCompile) {
      await appendSourcePage(newDoc, pdfDoc, sp);
    }
    return newDoc;
  };

  btnDownload.addEventListener('click', async () => {
    try {
      btnDownload.innerHTML = '<div class="spinner"></div>';
      const newDoc = await generateMutatedDoc();
      const pdfBytes = await newDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${currentFile.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showNotification('Error downloading PDF', 'error');
    } finally {
      btnDownload.innerHTML = 'Download';
    }
  });

  btnSplit.addEventListener('click', async () => {
    try {
      btnSplit.innerHTML = '<div class="spinner"></div>';
      // Determine split indices
      const splitIndices = [0];
      pages.forEach((p, i) => {
        if (p.splitActive) {
          splitIndices.push(i + 1); // Split occurs AFTER this page
        }
      });
      splitIndices.push(pages.length);
      
      const uniqueSplits = [...new Set(splitIndices)];

      // If only one chunk, it's just a download
      if (uniqueSplits.length === 2) {
        showNotification('Selected markers did not create multiple files.', 'info');
        btnDownload.click();
        return;
      }

      const chunksData = [];
      const fileBuffer = await currentFile.arrayBuffer();

      for (let i = 0; i < uniqueSplits.length - 1; i++) {
        const start = uniqueSplits[i];
        const end = uniqueSplits[i + 1];
        if (start === end) continue;

        // Load a fresh instance of the source doc per chunk — copyPages/embedPage mutate it.
        const freshSourceDoc = await PDFDocument.load(fileBuffer);
        const chunkDoc = await PDFDocument.create();
        let count = 0;
        for (let j = start; j < end; j++) {
          await appendSourcePage(chunkDoc, freshSourceDoc, pages[j]);
          count++;
        }
        const bytes = await chunkDoc.save();
        chunksData.push({ index: i + 1, bytes, count });
      }
      
      // Render Split UI
      splitList.innerHTML = '';
      chunksData.forEach(chunk => {
        const row = document.createElement('div');
        row.className = 'list-item';
        row.innerHTML = `
          <div class="file-info">
            <div class="file-name">Part ${chunk.index}</div>
            <div class="file-meta">${chunk.count} pages</div>
          </div>
          <button class="btn primary download-chunk-btn">Download</button>
        `;
        row.querySelector('.download-chunk-btn').addEventListener('click', () => {
          const blob = new Blob([chunk.bytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `split_part_${chunk.index}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        });
        splitList.appendChild(row);
      });

      splitPanel.classList.remove('hidden');
      splitPanel.scrollIntoView({ behavior: 'smooth' });
      
    } catch (err) {
      showNotification('Error splitting PDF', 'error');
    } finally {
      btnSplit.innerHTML = 'Split';
    }
  });

  btnExportImg.addEventListener('click', async () => {
    try {
      btnExportImg.innerHTML = '<div class="spinner"></div>';
      const zipData = {};
      const pagesToExport = pages.some(p => p.selected) ? pages.filter(p => p.selected) : pages;
      
      for (let i = 0; i < pagesToExport.length; i++) {
        const page = pagesToExport[i];
        const canvas = document.createElement('canvas');

        if (!page.spreadHalf) {
          const viewport = page.pdfjsPage.getViewport({ scale: 2, rotation: page.rotation });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.pdfjsPage.render({
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
          }).promise;
        } else {
          const nativeVp = page.pdfjsPage.getViewport({ scale: 2, rotation: 0 });
          const temp = document.createElement('canvas');
          temp.width = nativeVp.width;
          temp.height = nativeVp.height;
          await page.pdfjsPage.render({
            canvasContext: temp.getContext('2d'),
            viewport: nativeVp
          }).promise;
          const horizontal = page.spreadHalf === 'left' || page.spreadHalf === 'right';
          const halfW = horizontal ? nativeVp.width / 2 : nativeVp.width;
          const halfH = horizontal ? nativeVp.height : nativeVp.height / 2;
          const sx = page.spreadHalf === 'right' ? nativeVp.width / 2 : 0;
          const sy = page.spreadHalf === 'bottom' ? nativeVp.height / 2 : 0;
          const rot = ((page.rotation % 360) + 360) % 360;
          const rotated = rot === 90 || rot === 270;
          canvas.width = rotated ? halfH : halfW;
          canvas.height = rotated ? halfW : halfH;
          const ctx = canvas.getContext('2d');
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.drawImage(temp, sx, sy, halfW, halfH, -halfW / 2, -halfH / 2, halfW, halfH);
          ctx.restore();
        }

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const arrayBuffer = await blob.arrayBuffer();
        zipData[`page_${i + 1}.png`] = new Uint8Array(arrayBuffer);
      }
      
      const zipped = fflate.zipSync(zipData);
      const blob = new Blob([zipped], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `images_${currentFile.name.replace('.pdf', '')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      showNotification('Images exported as ZIP', 'success');
    } catch (err) {
      showNotification('Error exporting images', 'error');
    } finally {
      btnExportImg.innerHTML = 'Export Images';
    }
  });
}
