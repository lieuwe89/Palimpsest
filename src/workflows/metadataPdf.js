import { PDFDocument, PDFName, PDFString, PDFHexString, PDFRef } from 'pdf-lib';
import { showNotification } from '../utils/notifications.js';
import { bindPdfDropzone, downloadBytes } from '../utils/dropzone.js';

const TEXT_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'];
const XMP = 'XMP metadata';

const decode = (value) => {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    const text = value.decodeText();
    if (text.startsWith('D:')) {
      try {
        return { text: value.decodeDate().toLocaleString(), isDate: true };
      } catch { /* not a valid date after all */ }
    }
    return { text, isDate: false };
  }
  return { text: value ? value.toString() : '', isDate: false };
};

export function initMetadataPdf() {
  const dropzone = document.getElementById('meta-dropzone');
  const fileInput = document.getElementById('meta-file-input');
  const fieldsEl = document.getElementById('meta-fields');
  const clearBtn = document.getElementById('meta-clear-btn');
  const saveBtn = document.getElementById('meta-download-btn');

  let file = null;
  let rows = []; // { key, input?, removed }

  const reset = () => {
    file = null;
    rows = [];
    fieldsEl.replaceChildren();
    clearBtn.disabled = saveBtn.disabled = true;
  };

  // Values come from an untrusted PDF: only ever set them via .value / .textContent.
  const addRow = (key, text, editable) => {
    const row = { key, removed: false };
    const el = document.createElement('div');
    el.className = 'list-item meta-row';

    const label = document.createElement('div');
    label.className = 'meta-key';
    label.textContent = key;
    el.append(label);

    if (editable) {
      row.input = document.createElement('input');
      row.input.type = 'text';
      row.input.className = 'meta-value';
      row.input.value = text;
      row.input.placeholder = '(empty)';
      el.append(row.input);
    } else {
      const value = document.createElement('div');
      value.className = 'meta-value';
      value.textContent = text;
      el.append(value);
    }

    const remove = document.createElement('button');
    remove.className = 'remove-btn';
    remove.title = 'Remove this entry';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      row.removed = !row.removed;
      el.classList.toggle('removed', row.removed);
      if (row.input) row.input.disabled = row.removed;
    });
    el.append(remove);

    row.el = el;
    rows.push(row);
    fieldsEl.append(el);
  };

  bindPdfDropzone(dropzone, fileInput, async (pdf) => {
    try {
      const doc = await PDFDocument.load(await pdf.arrayBuffer(), { updateMetadata: false });
      reset();
      file = pdf;

      const info = doc.getInfoDict();
      for (const key of TEXT_KEYS) addRow(key, decode(info.lookup(PDFName.of(key))).text, true);
      for (const [name] of info.entries()) {
        const key = name.decodeText();
        if (TEXT_KEYS.includes(key)) continue;
        const { text, isDate } = decode(info.lookup(name));
        addRow(key, text, !isDate);
      }
      if (doc.catalog.has(PDFName.of('Metadata'))) addRow(XMP, 'Embedded XML (often repeats the fields above, plus editing history)', false);

      clearBtn.disabled = saveBtn.disabled = false;
    } catch (err) {
      if (err.message && err.message.includes('encrypted')) {
        showNotification(`Cannot load ${pdf.name}: PDF is encrypted. Use Unlock PDF first.`, 'error');
      } else {
        showNotification(`Error loading ${pdf.name}: ${err.message || err}`, 'error');
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    for (const row of rows) {
      row.removed = true;
      row.el.classList.add('removed');
      if (row.input) row.input.disabled = true;
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!file) return;
    try {
      saveBtn.disabled = true;
      // updateMetadata: false stops pdf-lib from stamping its own Producer/Creator/ModDate.
      const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      const info = doc.getInfoDict();

      // pdf-lib saves every object in the file, referenced or not, so removing only the
      // reference would leave the old value in the bytes. Delete the object itself too.
      const drop = (dict, name) => {
        const value = dict.get(name);
        if (value instanceof PDFRef) doc.context.delete(value);
        dict.delete(name);
      };

      for (const row of rows) {
        if (row.key === XMP) {
          if (row.removed) drop(doc.catalog, PDFName.of('Metadata'));
          continue;
        }
        const name = PDFName.of(row.key);
        const text = row.input?.value.trim();
        if (row.removed || text === '') drop(info, name);
        else if (row.input) {
          drop(info, name);
          info.set(name, PDFHexString.fromText(text));
        }
      }

      const bytes = await doc.save({ useObjectStreams: true });
      downloadBytes(bytes, file.name);
      showNotification('Metadata saved!', 'success');
    } catch (err) {
      showNotification(`Error saving metadata: ${err.message || err}`, 'error');
    } finally {
      saveBtn.disabled = !file;
    }
  });
}
