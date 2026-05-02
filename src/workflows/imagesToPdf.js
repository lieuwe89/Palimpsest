import Sortable from 'sortablejs';
import { PDFDocument } from 'pdf-lib';
import { showNotification } from '../utils/notifications.js';

export function initImagesToPdf() {
  const dropzone = document.getElementById('img-dropzone');
  const fileInput = document.getElementById('img-file-input');
  const listContainer = document.getElementById('img-thumbnails');
  const downloadBtn = document.getElementById('img-download-btn');
  
  let files = [];
  
  new Sortable(listContainer, {
    animation: 150,
    onEnd: (evt) => {
      const itemEl = files.splice(evt.oldIndex, 1)[0];
      files.splice(evt.newIndex, 0, itemEl);
    }
  });

  const handleFiles = async (newFiles) => {
    const validFiles = Array.from(newFiles).filter(f => f.type === 'image/jpeg' || f.type === 'image/png');
    if (validFiles.length < newFiles.length) {
      showNotification('Expected an image (JPG or PNG). Some files were ignored.', 'error');
    }

    for (const file of validFiles) {
      const id = Date.now().toString() + Math.random();
      const url = URL.createObjectURL(file);
      files.push({ id, file, url });
    }
    renderList();
    updateUI();
  };

  const renderList = () => {
    listContainer.innerHTML = '';
    files.forEach((f) => {
      const el = document.createElement('div');
      el.className = 'thumbnail-card';
      el.dataset.id = f.id;
      el.innerHTML = `
        <button class="thumbnail-remove" data-id="${f.id}">&times;</button>
        <div class="thumbnail-canvas-container">
          <img src="${f.url}" alt="${f.file.name}" style="max-height: 200px; width: auto; display: block; margin: 0 auto;" />
        </div>
        <div class="thumbnail-label">${f.file.name}</div>
      `;
      el.querySelector('.thumbnail-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        files = files.filter(file => file.id !== f.id);
        renderList();
        updateUI();
      });
      listContainer.appendChild(el);
    });
  };

  const updateUI = () => {
    downloadBtn.disabled = files.length === 0;
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
    if (files.length === 0) return;
    try {
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = '<div class="spinner"></div>';
      const pdfDoc = await PDFDocument.create();
      for (const f of files) {
        const imageBytes = await f.file.arrayBuffer();
        let image;
        if (f.file.type === 'image/jpeg') {
          image = await pdfDoc.embedJpg(imageBytes);
        } else {
          image = await pdfDoc.embedPng(imageBytes);
        }
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const outUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = outUrl;
      const filenameInput = document.getElementById('img-filename');
      let filename = filenameInput.value.trim() || 'images.pdf';
      if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
      a.download = filename;
      a.click();
      URL.revokeObjectURL(outUrl);
      showNotification('PDF created successfully!', 'success');
    } catch (err) {
      showNotification('Error creating PDF.', 'error');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = 'Create PDF';
    }
  });
}
