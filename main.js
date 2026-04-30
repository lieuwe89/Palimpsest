import { initEditPdf } from './src/workflows/editPdf.js';
import { initMergePdfs } from './src/workflows/mergePdfs.js';
import { initImagesToPdf } from './src/workflows/imagesToPdf.js';

document.addEventListener('DOMContentLoaded', () => {
  const views = {
    'home': document.getElementById('view-home'),
    'edit-pdf': document.getElementById('view-edit-pdf'),
    'merge-pdfs': document.getElementById('view-merge-pdfs'),
    'images-to-pdf': document.getElementById('view-images-to-pdf')
  };

  const navHomeBtn = document.getElementById('nav-home');
  const logoHomeBtn = document.getElementById('logo-home');

  function switchView(viewId) {
    Object.values(views).forEach(el => {
      if (el) {
        el.classList.remove('active');
        // A little trick to restart animations
        el.style.animation = 'none';
        el.offsetHeight; // trigger reflow
        el.style.animation = null; 
      }
    });
    
    // Hide all views except the active one
    Object.keys(views).forEach(id => {
      if (id !== viewId && views[id]) {
        views[id].classList.add('hidden');
      }
    });

    if (views[viewId]) {
      views[viewId].classList.remove('hidden');
      views[viewId].classList.add('active');
    }
    
    if (viewId === 'home') {
      navHomeBtn.classList.add('active');
    } else {
      navHomeBtn.classList.remove('active');
    }
  }

  navHomeBtn.addEventListener('click', () => switchView('home'));
  logoHomeBtn.addEventListener('click', () => switchView('home'));

  document.querySelectorAll('.action-card').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.getAttribute('data-target');
      if (target) switchView(target);
    });
  });

  // Initialize workflows
  initEditPdf();
  initMergePdfs();
  initImagesToPdf();
});
