import { APP_CONFIG } from '../config.js';
import { toast } from '../ui/toast.js';

function waitForLayout() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function buildPrintTitle(title) {
  const date = new Date().toLocaleDateString('ar-EG');
  return `${title} — ${APP_CONFIG.name} — ${date}`;
}

export async function printReport({ root, title = 'تقرير' } = {}) {
  if (!root) {
    toast('تعذر تحديد محتوى التقرير.', 'error');
    return false;
  }
  const previousTitle = document.title;
  const previousClass = document.body.className;
  const previousPrintTitle = root.getAttribute('data-print-title');

  root.setAttribute('data-print-title', buildPrintTitle(title));
  document.body.classList.add('print-report-mode');
  document.title = buildPrintTitle(title);

  try {
    await waitForLayout();
    window.print();
    return true;
  } catch (error) {
    console.error(error);
    toast('تعذر فتح نافذة الطباعة.', 'error');
    return false;
  } finally {
    const restore = () => {
      document.title = previousTitle;
      document.body.className = previousClass;
      if (previousPrintTitle == null) root.removeAttribute('data-print-title');
      else root.setAttribute('data-print-title', previousPrintTitle);
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore, { once: true });
    setTimeout(restore, 2000);
  }
}

export function printButton(title = 'طباعة / حفظ PDF') {
  return `<button type="button" class="secondary-button print-control" data-print-report>🖨️ ${title}</button>`;
}

export function bindPrintButton(root, { title = 'تقرير' } = {}) {
  const button = root.querySelector('[data-print-report]');
  if (!button) return;
  button.onclick = () => printReport({ root, title });
}
