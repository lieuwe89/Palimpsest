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

// Shows the loaded file as a list item with a status line; the × calls onRemove.
export function renderFileItem(container, file, meta, onRemove) {
  if (!file) {
    container.replaceChildren();
    return;
  }
  container.innerHTML = `
    <div class="list-item">
      <div class="file-info">
        <div class="file-name"></div>
        <div class="file-meta"></div>
      </div>
      <button class="remove-btn" title="Remove file">&times;</button>
    </div>
  `;
  const name = container.querySelector('.file-name');
  name.textContent = name.title = file.name;
  container.querySelector('.file-meta').textContent = meta;
  container.querySelector('.remove-btn').addEventListener('click', onRemove);
}

export function downloadBytes(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
