/* app.js — SPA router, auth guard, sidebar navigation */

const App = {
  currentView: null,

  async init() {
    // Check auth
    const auth = await API.check().catch(() => ({ authenticated: false }));
    if (!auth.authenticated) {
      this._showLogin();
    } else {
      this._showApp();
      this._navigate(this._getViewFromHash() || 'dashboard');
    }

    // Login form
    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn   = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');
      errEl.classList.add('hidden');
      setLoading(btn, true);
      try {
        await API.login(
          document.getElementById('login-user').value,
          document.getElementById('login-pass').value
        );
        document.getElementById('login-overlay').classList.add('hidden');
        this._showApp();
        this._navigate('dashboard');
      } catch(e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      } finally { setLoading(btn, false); }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await API.logout();
      this._showLogin();
    });

    // Nav links
    document.querySelectorAll('.nav-item').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        this._navigate(link.dataset.view);
      });
    });

    // Hash navigation
    window.addEventListener('hashchange', () => {
      const view = this._getViewFromHash();
      if (view && view !== this.currentView) this._navigate(view);
    });
  },

  navigate(view) { this._navigate(view); },

  _getViewFromHash() {
    return window.location.hash.replace('#', '') || null;
  },

  _showLogin() {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  _showApp() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  },

  _navigate(view) {
    this.currentView = view;
    window.location.hash = view;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    const container = document.getElementById('view-container');
    const views = {
      dashboard: () => renderDashboard(container),
      schedule:  () => renderScheduleEditor(container),
      employees: () => renderEmployees(container),
      history:   () => renderHistory(container),
      calendar:  () => renderCalendarView(container),
      config:    () => renderConfig(container),
    };

    if (views[view]) {
      views[view]().catch(e => {
        container.innerHTML = `<div class="page"><div class="alert alert-danger">❌ Error: ${e.message}</div></div>`;
        console.error(e);
      });
    }
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
