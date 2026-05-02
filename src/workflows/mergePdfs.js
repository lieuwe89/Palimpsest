import Sortable from 'sortablejs';
import { PDFDocument } from 'pdf-lib';
import { showNotification } from '../utils/notifications.js';

export function initMergePdfs() {
  const dropzone = document.getElementById('merge-dropzone');
  const fileInput = document.getElementById('merge-file-input');
  const listContainer = document.getElementById('merge-list');
  const downloadBtn = document.getElementById('merge-download-btn');
  
  let files = [];
  
  new Sortable(listContainer, {
    animation: 150,
    handle: '.drag-handle',
    onEnd: (evt) => {
      const itemEl = files.splice(evt.oldIndex, 1)[0];
      files.splice(evt.newIndex, 0, itemEl);
    }
  });

  const handleFiles = async (newFiles) => {
    const pdfFiles = Array.from(newFiles).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length < newFiles.length) {
      showNotification('Expected a PDF. Some files were ignored.', 'error');
    }

    for (const file of pdfFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();
        
        const fileData = { id: Date.now().toString() + Math.random(), file, pageCount, arrayBuffer };
        files.push(fileData);
        renderList();
      } catch (err) {
        if (err.message && err.message.includes('encrypted')) {
          showNotification(`Cannot load ${file.name}: PDF is encrypted. Please unlock it first.`, 'error');
        } else {
          showNotification(`Error loading ${file.name}: ${err.message || err}`, 'error');
        }
      }
    }
    updateUI();
  };

  const renderList = () => {
    listContainer.innerHTML = '';
    files.forEach((f) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.dataset.id = f.id;
      el.innerHTML = `
        <div class="drag-handle" title="Drag to reorder">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </div>
        <div class="file-info">
          <div class="file-name" title="${f.file.name}">${f.file.name}</div>
          <div class="file-meta">${f.pageCount} page(s)</div>
        </div>
        <button class="remove-btn" data-id="${f.id}" title="Remove file">&times;</button>
      `;
      el.querySelector('.remove-btn').addEventListener('click', () => {
        files = files.filter(file => file.id !== f.id);
        renderList();
        updateUI();
      });
      listContainer.appendChild(el);
    });
  };

  const updateUI = () => {
    downloadBtn.disabled = files.length < 2;
  };

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
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
    handleFiles(e.dataTransfer.files);
  });

  downloadBtn.addEventListener('click', async () => {
    if (files.length < 2) return;
    try {
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = '<div class="spinner"></div>';
      const mergedPdf = await PDFDocument.create();
      for (const f of files) {
        const buffer = await f.file.arrayBuffer();
        const doc = await PDFDocument.load(buffer);
        const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filenameInput = document.getElementById('merge-filename');
      let filename = filenameInput.value.trim() || 'merged.pdf';
      if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('PDF merged successfully!', 'success');
    } catch (err) {
      if (err.message && err.message.includes('encrypted')) {
        showNotification('Error: One of the PDFs is encrypted and cannot be merged.', 'error');
      } else {
        showNotification(`Error merging PDFs: ${err.message || err}`, 'error');
      }
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = 'Merge & Download';
    }
  });
}
