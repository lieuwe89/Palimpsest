# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Palimpsest — client-side, browser-only PDF utility (edit, merge, images→PDF). Live at `playground.lieuwejongsma.nl/palimpsest`. Zero backend — every byte stays in browser memory.

## Commands

```bash
npm install          # install deps
npm run dev          # Vite dev server (http://localhost:5173/palimpsest/)
npm run build        # production build → dist/
npm run preview      # serve built dist/ locally
```

No test framework, no linter, no formatter configured. Don't invent commands.

## Deployment

- Static site. Output is `dist/` only — upload contents to any web server.
- `vite.config.js` pins `base: '/palimpsest/'`. **Change to `'/'` if deploying to domain root, otherwise asset URLs 404.**
- `public/.htaccess` forces `text/javascript` MIME on `.js`/`.mjs` for Apache (required — pdf.js worker is `.mjs`).
- For non-Apache hosts (nginx/Vercel/Netlify), configure equivalent MIME or strip the htaccess assumption.

## Architecture

**Single-page, vanilla JS, no framework, no router lib.** All views live in `index.html` as `<section id="view-*">` blocks; `main.js` toggles `.active`/`.hidden` classes on them. No history API, no routes — purely DOM visibility.

**Workflow module pattern.** Each feature is a single `init*()` function in `src/workflows/`:
- `editPdf.js` — load PDF, render thumbnails, reorder/rotate/split/export-as-images
- `mergePdfs.js` — combine multiple PDFs
- `imagesToPdf.js` — JPG/PNG → single PDF

Each `init*()` is called once in `main.js`'s `DOMContentLoaded` handler. They reach into the DOM directly via `getElementById` (IDs are namespaced: `edit-*`, `merge-*`, `img-*`). State is closed-over inside the init function (local `let files = []`, `let pages = []`). **No shared store, no event bus, no component framework — adding a workflow means: add a `<section>` to index.html, write `init*()`, call it from main.js.**

**Two PDF libraries, two purposes.**
- `pdf-lib` — binary PDF mutation (load, copy pages, rotate, save). Used for output.
- `pdfjs-dist` — page rendering to canvas for thumbnails. Worker bundled via Vite's `?url` import in `src/utils/pdfWorker.js` — that file is the single source of `pdfjsLib`, import from there, not directly from `pdfjs-dist`.

**Dual-buffer load pattern.** `pdf-lib` and `pdf.js` both consume the source `ArrayBuffer` destructively. `editPdf.js` slices two copies upfront (`arrayBuffer.slice(0)` × 2) before passing to either. Preserve this when adding new PDF flows or you'll get cryptic detach errors on the second consumer.

**Split feature reloads source per chunk.** In `editPdf.js` `btnSplit`, each chunk does `PDFDocument.load(fileBuffer)` fresh because `copyPages` mutates the source doc. Don't try to optimize this into a single shared load.

**Encryption is a known dead-end.** `pdf-lib` cannot rewrite encrypted streams. Both `editPdf` and `mergePdfs` catch `err.message.includes('encrypted')` and surface a user notification telling them to unlock first (e.g., Chrome's "Save as PDF"). Keep this branch in new flows that load PDFs.

**ZIP via fflate.** Image export (edit-pdf) and any future bulk download uses `fflate.zipSync` synchronously in main thread — fine for thumbnails but **don't sync-zip large binaries** (would block UI).

## Design system

`style.css` is one file, hand-written, Bauhaus-themed. Hard rules baked in:

- **No rounded corners.** `* { border-radius: 0 !important; }` is intentional — don't override.
- Palette is CSS vars on `:root` (`--bauhaus-red/yellow/blue/dark`). Use these, not literal hex.
- Border widths: `--border-width: 2px` (default), `--border-width-thick: 4px` (emphasis).
- Font: Lexend loaded from Google Fonts in `index.html`. Single family for the whole app.
- Animations use `steps()` timing (`steps(4)`, `steps(8)`) to feel mechanical, not smooth.
- Hover convention: translate + hard offset shadow (`translate(-3px,-3px) + 5px 5px 0 var(--border-color)`).

When adding UI, follow the existing toolbar / dropzone / thumbnail-card / list-item primitives — they're shared across all three workflows.

## Version bump

`package.json` is `"version": "0.0.0"` (private) and not used for releases. The README's Bauhaus copy doubles as the public version marker — no automatic bump skill applies here.

## Gotchas

- `index.html` references `./Palimpsest logo.svg` and `./Favicon.png` at root — these live in repo root, not `public/`. Vite serves them from root in dev and copies on build because they're referenced from `index.html`. Keep them in root.
- The Affinity (`.af`) source files (`Palimpsest logo.af`, etc.) are design source — never reference them from code, never delete.
- `docs/superpowers/` and `.superpowers/` are in `.gitignore` — local scratch only.
- Parent dir `/Users/lieuwejongsma/projects/CLAUDE.md` describes the broader workspace. Don't duplicate that context here.
