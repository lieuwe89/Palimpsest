// Copies the Tesseract.js worker, WASM core and language models into public/
// so OCR is served from our own origin instead of a CDN.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const modules = `${root}node_modules/`;
const out = `${root}public/tesseract/`;

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // Default OEM is LSTM-only; Tesseract.js picks the fastest build the browser supports.
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['@tesseract.js-data/nld/4.0.0_best_int/nld.traineddata.gz', 'nld.traineddata.gz'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];

mkdirSync(out, { recursive: true });
for (const [from, to] of files) cpSync(modules + from, out + to);
console.log(`Copied ${files.length} Tesseract files to public/tesseract/`);
