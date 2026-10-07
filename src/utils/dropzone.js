import { showNotification } from './notifications.js';

// Wires click-to-browse and drag & drop for a single-PDF workflow; calls onFile with the first PDF.
export function bindPdfDropzone(dropzone, fileInput, onFile) {
  const handle = (files) => {
    const pdf = Array.from(files).find(f => f.type === 'application/pdf');
    if (pdf) onFile(pdf);
    else showNotification('Expected a PDF.', 'error');
  };

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    handle(e.target.files);
    e.target.value = '';
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handle(e.dataTransfer.files);
  });
}

export function downloadBytes(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
