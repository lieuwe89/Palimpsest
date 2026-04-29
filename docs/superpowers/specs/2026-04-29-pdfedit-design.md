# PDFedit — Design Spec

**Date:** 2026-04-29  
**Status:** Approved

## Overview

A client-side web application for common PDF operations: editing page order/orientation, splitting, merging, and converting to/from images. No backend — all processing happens in the browser. Deployed as static files to an Apache/Nginx VPS. Public-facing but no authentication required.

## Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Build tool | Vite | Fast dev server, simple static output |
| PDF manipulation | pdf-lib | Full read/write PDF support in-browser |
| PDF rendering | pdfjs-dist (PDF.js) | Renders page thumbnails to `<canvas>` |
| Drag & drop (reorder) | Sortable.js | Handles both mouse and touch; works on mobile |
| ZIP creation | fflate | Tiny, no native deps, needed for multi-file downloads |
| Framework | Vanilla JS (ES modules) | Scope doesn't justify a framework |

## App Structure

Three independent workflows behind a home screen.

### Home Screen

Three large cards — one per workflow. Click a card to enter that workflow.

### Workflow: Edit PDF

**Entry:** drop or pick a single PDF file.

**View:** scrollable responsive grid of page thumbnails. Each thumbnail is rendered by pdfjs to a `<canvas>`. Fewer columns on small screens (mobile: 2–3 columns; desktop: 5–8 columns).

**Interactions:**
- Click thumbnail → select/deselect page
- Shift+click → range select
- Tap (mobile) → select/deselect
- Drag thumbnail → reorder page (Sortable.js, touch-compatible)

**Toolbar actions (disabled until preconditions met):**
- **Rotate** — rotate selected pages 90° CW; re-render affected thumbnails
- **Split** — each selected page is a split point (the split occurs before that page). Selecting pages 4 and 8 in a 10-page PDF produces three files: pages 1–3, 4–7, 8–10. Result downloads as ZIP when more than one output file. Disabled when PDF has only one page or no pages are selected.
- **Export as images** — render all pages via pdfjs to PNG, download as ZIP
- **Download** — serialize current `PDFDocument` state (rotations + reordering applied) and trigger browser download

All mutations happen on an in-memory `pdf-lib` `PDFDocument`. No auto-save; closing the tab discards work.

### Workflow: Merge PDFs

**Entry:** drop zone accepting multiple PDFs (or click to browse).

**View:** ordered list of files with filename, page count, drag handle, and remove button.

**Interactions:**
- Drop additional files → append to list
- Drag handle → reorder files (Sortable.js)
- Remove button → remove file from list

**Action:** "Merge & Download" — creates a new `PDFDocument`, copies pages from each source doc in list order, triggers download. Disabled until ≥2 files are loaded.

### Workflow: Images → PDF

**Entry:** drop zone accepting JPG and PNG files.

**View:** responsive grid of image thumbnails with drag handles.

**Interactions:**
- Drop additional images → append to grid
- Drag → reorder (Sortable.js)
- Remove button on each thumbnail

**Action:** "Create PDF" — creates a new `PDFDocument`, embeds each image as a full page sized to the image's natural dimensions, triggers download. Disabled until ≥1 image loaded.

## Responsive Design

All three workflows must work on mobile and desktop.

- Layouts use CSS flexbox/grid with responsive breakpoints
- Tap targets ≥ 44px (Apple HIG minimum)
- Drag reorder uses Sortable.js (handles touch drag natively)
- File input via `<input type="file">` (works on iOS/Android — accesses camera roll and Files app)
- Downloads via `URL.createObjectURL` + hidden `<a>` click (works on modern mobile browsers)

## Error Handling

All errors shown as inline dismissible banners — no native `alert()` or page reloads.

| Scenario | Message |
|---|---|
| Wrong file type | "Expected a PDF" / "Expected an image (JPG or PNG)" |
| Corrupted or password-protected PDF | "Could not open this file — it may be corrupted or password-protected" |
| Large PDF (slow thumbnail render) | Spinner per thumbnail; renders progressively |
| Single-page PDF → Split | Split button disabled with tooltip "Nothing to split — PDF has only one page" |
| No files / no selection | Action buttons disabled until preconditions met |

## Browser Support

Modern Chrome, Firefox, Safari, Edge. **Internet Explorer is not supported.**

IE users (detected via `window.document.documentMode`) see a full-page unsupported-browser message instead of the app UI, before any JS libraries load.

## Out of Scope

- Annotation, signing, form filling
- PDF compression
- Persistence / file history
- Authentication
- Server-side processing
