export function showNotification(message, type = 'info') {
  const container = document.getElementById('notifications-container');
  if (!container) return;
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.id = `notify-${id}`;
  el.innerHTML = `
    <div class="notification-content">${message}</div>
    <button class="notification-close">&times;</button>
  `;
  container.appendChild(el);

  const remove = () => {
    el.style.animation = 'fadeOut 0.3s ease-out forwards';
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
  };
  el.querySelector('.notification-close').addEventListener('click', remove);
  setTimeout(remove, 5000);
}
