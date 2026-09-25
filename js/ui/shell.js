import { NAV_GROUPS } from '../core/constants.js';
import { escapeHtml } from '../core/utils.js';

export function renderNavigation(container, routes, currentRoute) {
  container.innerHTML = NAV_GROUPS.map(group => `
    <div class="nav-section">${escapeHtml(group.title)}</div>
    ${group.items.map(([route, icon, label]) => `
      <a class="nav-link ${route === currentRoute ? 'active' : ''}" href="#/${route}" data-route="${escapeHtml(route)}">
        <span class="nav-icon" aria-hidden="true">${icon}</span>
        <span>${escapeHtml(label)}</span>
      </a>`).join('')}
  `).join('');
}

export function setActiveNavigation(container, route) {
  container.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.route === route);
  });
}

export function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
}

export function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

export function setupShellEvents({ router }) {
  const menu = document.getElementById('menuToggle');
  const search = document.getElementById('globalSearchButton');
  const quickAdd = document.getElementById('quickAddButton');
  const backdrop = document.getElementById('sidebarBackdrop');

  menu?.addEventListener('click', () => {
    toggleSidebar();
    backdrop?.classList.toggle('hidden', !document.getElementById('sidebar')?.classList.contains('open'));
  });
  backdrop?.addEventListener('click', () => {
    closeSidebar();
    backdrop.classList.add('hidden');
  });
  search?.addEventListener('click', () => router.go('search'));
  quickAdd?.addEventListener('click', () => router.go('quick-add'));

  document.getElementById('mainNav')?.addEventListener('click', () => {
    closeSidebar();
    backdrop?.classList.add('hidden');
  });
}
