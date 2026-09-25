import { getAttentionItems } from '../dashboard/attention.js';
import { escapeHtml } from '../core/utils.js';
import { formatDate } from '../core/dates.js';

export async function setupNotificationCenter({ router }) {
  const button = document.getElementById('notificationButton');
  const count = document.getElementById('notificationCount');
  const root = document.getElementById('modalRoot');
  if (!button || !root) return () => {};

  let destroyed = false;
  let latestItems = [];

  const severityLabel = { danger: 'عاجل تشغيليًا', warning: 'يحتاج متابعة', info: 'مراجعة بيانات' };

  async function refreshCount() {
    try {
      latestItems = await getAttentionItems();
      if (destroyed) return;
      count.textContent = String(latestItems.length);
      count.classList.toggle('zero', latestItems.length === 0);
      button.setAttribute('aria-label', latestItems.length ? `التنبيهات — ${latestItems.length}` : 'التنبيهات — لا توجد');
    } catch {
      count.textContent = '0';
      count.classList.add('zero');
    }
  }

  const open = async () => {
    await refreshCount();
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    const groups = latestItems.reduce((map, item) => {
      const key = item.severity || 'info';
      (map[key] ||= []).push(item);
      return map;
    }, {});
    const order = ['danger', 'warning', 'info'];
    const body = order.flatMap(key => (groups[key] || []).map(x => `
      <a class="work-item attention-${escapeHtml(x.severity || 'info')}" href="#/${escapeHtml(x.route)}">
        <div><span class="badge">${escapeHtml(severityLabel[x.severity] || 'تنبيه')}</span><strong>${escapeHtml(x.title)}</strong><span class="muted">${escapeHtml(x.description || '')}</span></div>
        <time>${escapeHtml(formatDate(x.date))}</time>
      </a>`)).join('');
    wrap.innerHTML = `<section class="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notificationsTitle"><div class="modal-header"><h2 id="notificationsTitle">مركز التنبيهات</h2><button class="icon-button" type="button" data-close>×</button></div><p class="muted">هذه تنبيهات تشغيلية مبنية على البيانات المسجلة. لا يقرر النظام منها صحة أو بطلانًا قانونيًا.</p><div class="work-list">${body || '<div class="empty">لا توجد تنبيهات حاليًا.</div>'}</div></section>`;
    const close = () => wrap.remove();
    wrap.querySelector('[data-close]').addEventListener('click', close);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.addEventListener('click', e => { if (e.target.closest('.work-item')) close(); });
    root.appendChild(wrap);
  };

  button.addEventListener('click', open);
  await refreshCount();
  const timer = window.setInterval(refreshCount, 60000);
  let hashTimer = null;
  const onHash = () => { clearTimeout(hashTimer); hashTimer = setTimeout(refreshCount, 600); };
  window.addEventListener('hashchange', onHash);

  return () => {
    destroyed = true;
    window.clearInterval(timer);
    clearTimeout(hashTimer);
    window.removeEventListener('hashchange', onHash);
    button.removeEventListener('click', open);
  };
}
