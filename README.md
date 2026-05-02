# Palimpsest

Palimpsest is a modern, client-side web application for quick, secure, and intuitive PDF manipulation. 

**Features:**
- **Edit PDFs**: Reorder, rotate, delete pages, and extract specific pages as images.
- **Visual Splitting**: Use interactive Bauhaus-style markers to define split points between pages and download chunks instantly.
- **Merge PDFs**: Combine multiple files seamlessly with a high-contrast sorting interface.
- **Images to PDF**: Batch convert PNG and JPG files into a single, cohesive PDF document with automatic aspect-ratio preservation.
- **Privacy First**: 100% browser-based. No PDF files ever leave your device or are uploaded to any server.

## Tech Stack
- **Framework**: [Vite](https://vitejs.dev/) with Vanilla Javascript.
- **Aesthetic**: Custom Bauhaus-inspired design system (high-contrast, geometric, zero-radius borders).
- **Core Engine**: [`pdf-lib`](https://pdf-lib.js.org/) for binary PDF mutations.
- **Rendering**: [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) running in a Web Worker for high-fidelity page thumbnails.
- **UX**: [`SortableJS`](https://github.com/SortableJS/Sortable) for drag-and-drop reordering, [`fflate`](https://github.com/101arrowz/fflate) for ultra-fast client-side ZIP generation for image/split exports.

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

- **Base Path**: The current build is configured with a base path of `/palimpsest/` (see `vite.config.js`). If you are deploying to the root of your domain, change this to `/`.
- **Static Assets**: After running `npm run build`, upload the contents of the `dist/` directory to your server (e.g., via `scp` or `rsync`).
- **MIME Types**: Ensure your production server serves `.mjs` files with the `text/javascript` MIME type. A `public/.htaccess` file is included for Apache environments.

## Known Limitations
- **Encryption:** `pdf-lib` cannot natively rewrite streams of encrypted PDFs. Palimpsest includes logic to detect encrypted/password-protected PDFs and will gracefully instruct the user to unlock them first (e.g., via "Save as PDF" in Chrome).
