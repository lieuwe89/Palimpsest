# Palimpsest

Palimpsest is a modern, client-side web application for quick, secure, and intuitive PDF manipulation. 

**Features:**
- **Edit PDFs**: Reorder, rotate, delete pages, and extract specific pages as images or chunks.
- **Split PDFs**: Visually define markers between pages and download selective splits directly to your machine.
- **Merge PDFs**: Combine multiple files seamlessly and reorder them before merging.
- **Images to PDF**: Batch convert PNG and JPG files into a single, cohesive PDF document.
- **100% Secure**: Palimpsest is fully client-side. No PDF files ever leave your device or are uploaded to any server.

## Tech Stack
- **Framework**: [Vite](https://vitejs.dev/) with Vanilla Javascript and CSS (Glassmorphism UI).
- **Core Engine**: [`pdf-lib`](https://pdf-lib.js.org/) for binary PDF modifications (merging, splitting, creating).
- **Rendering**: [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) running in a Web Worker for fast, accurate page thumbnails.
- **UX**: [`SortableJS`](https://github.com/SortableJS/Sortable) for drag-and-drop page and file reordering, [`fflate`](https://github.com/101arrowz/fflate) for ultra-fast client-side ZIP generation.

## Local Development

Ensure you have Node.js installed.

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```
   *The optimized static assets will be generated in the `/dist` directory.*

## Deployment

Palimpsest compiles to a static website and can be hosted on any standard web server (Apache, Nginx, Vercel, Netlify). 

> **Important (Web Workers):** Ensure your production server serves `.mjs` files with the `text/javascript` MIME type, as `pdfjs-dist` dynamically imports its web worker. A `public/.htaccess` file is included to automatically handle this for Apache environments.

## Known Limitations
- **Encryption:** `pdf-lib` cannot natively rewrite streams of encrypted PDFs. Palimpsest includes logic to detect encrypted/password-protected PDFs and will gracefully instruct the user to unlock them first (e.g., via "Save as PDF" in Chrome).
