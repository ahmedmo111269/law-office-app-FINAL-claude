export class Router {
  constructor(routes, { onChange } = {}) {
    this.routes = routes;
    this.onChange = onChange;
    this.current = null;
    this.bound = () => this.handle();
  }

  start() {
    window.addEventListener('hashchange', this.bound);
    this.handle();
  }

  stop() {
    window.removeEventListener('hashchange', this.bound);
  }

  getRoute() {
    const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const route = raw.split('?')[0].split('/')[0] || 'dashboard';
    return this.routes[route] ? route : 'dashboard';
  }

  go(route, query = '') {
    if (!this.routes[route]) return;
    location.hash = `#/${route}${query ? `?${query.replace(/^\?/, '')}` : ''}`;
  }

  handle() {
    const route = this.getRoute();
    if (route === this.current && this.current !== null) {
      this.onChange?.(route, { repeat: true });
      return;
    }
    this.current = route;
    this.onChange?.(route, { repeat: false });
  }
}
