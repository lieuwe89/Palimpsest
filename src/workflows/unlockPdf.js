import { PDFDocument } from 'pdf-lib';
import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { showNotification } from '../utils/notifications.js';
import { bindPdfDropzone, downloadBytes, renderFileItem } from '../utils/dropzone.js';

// Returns the decrypted PDF, or throws with qpdf's own message (e.g. "invalid password").
export async function unlockPdf(bytes, password = '') {
  // Loaded on demand: qpdf is only needed here. A fresh instance per run, because
  // Emscripten programs aren't guaranteed to survive a second callMain.
  const { default: createModule } = await import('@neslinesli93/qpdf-wasm');
  const args = ['--decrypt', '/in.pdf', '/out.pdf'];
  if (password) args.unshift(`--password=${password}`);

  // This build ignores the printErr option and binds console.error when the module is
  // created, so capture console.error from creation until the run is done.
  const errors = [];
  const consoleError = console.error;
  console.error = (...parts) => errors.push(parts.join(' '));
  let code;
  let qpdf;
  try {
    qpdf = await createModule({ locateFile: () => qpdfWasmUrl, noInitialRun: true });
    qpdf.FS.writeFile('/in.pdf', bytes);
    code = qpdf.callMain(args);
  } catch (err) {
    if (typeof err?.status !== 'number') throw err;
    code = err.status; // Emscripten reports exit() as a thrown ExitStatus
  } finally {
    console.error = consoleError;
  }
  // qpdf exit codes: 0 ok, 3 ok with warnings, 2 error.
  if (code !== 0 && code !== 3) throw new Error(errors.join(' ') || `qpdf exited with code ${code}`);
  return qpdf.FS.readFile('/out.pdf');
}

export function initUnlockPdf() {
  const dropzone = document.getElementById('unlock-dropzone');
  const fileInput = document.getElementById('unlock-file-input');
  const info = document.getElementById('unlock-info');
  const passwordInput = document.getElementById('unlock-password');
  const unlockBtn = document.getElementById('unlock-download-btn');

  let file = null;

  const renderInfo = (meta) => renderFileItem(info, file, meta, () => {
    file = null;
    renderInfo();
    unlockBtn.disabled = true;
  });

  bindPdfDropzone(dropzone, fileInput, async (pdf) => {
    file = pdf;
    try {
      const doc = await PDFDocument.load(await pdf.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      if (!doc.isEncrypted) {
        renderInfo('Not encrypted — nothing to unlock');
        unlockBtn.disabled = true;
        return;
      }
    } catch {
      // Some encrypted files are too scrambled for pdf-lib to even peek at; let qpdf try.
    }
    renderInfo('Encrypted. If it asks for a password to open, enter it above.');
    unlockBtn.disabled = false;
  });

  unlockBtn.addEventListener('click', async () => {
    if (!file) return;
    const original = file;
    try {
      unlockBtn.disabled = true;
      unlockBtn.textContent = 'Unlocking…';
      const bytes = await unlockPdf(new Uint8Array(await original.arrayBuffer()), passwordInput.value);
      renderInfo('Unlocked — restrictions and encryption removed');
      downloadBytes(bytes, original.name.replace(/\.pdf$/i, '') + '-unlocked.pdf');
      showNotification('PDF unlocked!', 'success');
    } catch (err) {
      if (/password/i.test(err.message)) {
        renderInfo('This PDF needs the password to open it');
        showNotification(passwordInput.value ? 'That password is not correct.' : 'This PDF is password-protected. Enter the password first.', 'error');
      } else {
        showNotification(`Error unlocking PDF: ${err.message || err}`, 'error');
      }
    } finally {
      unlockBtn.disabled = !file;
      unlockBtn.textContent = 'Unlock & Download';
    }
  });
}
