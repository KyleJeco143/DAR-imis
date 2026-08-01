// Mocks the app's Supabase backend (auth + PostgREST + realtime) so tests
// run deterministically without a live Supabase project. The project URL
// below is read directly out of index.html's bundled createClient() call.
const SUPABASE_URL = 'https://btktxpwogocltkshepjy.supabase.co';

class SupabaseMock {
  constructor(page, { url = SUPABASE_URL } = {}) {
    this.page = page;
    this.url = url;
    this.authResult = null;
    this.tables = {};
    this.requests = [];
    this._failNextWrite = false;
    this._failMessage = 'mocked write failure';
  }

  /** Seed the fixture rows a table's initial GET should return. */
  seed(table, rows) {
    this.tables[table] = rows.slice();
  }

  /** All captured requests for a table (or all tables if omitted). */
  getRequests(table) {
    return table ? this.requests.filter((r) => r.table === table) : this.requests.slice();
  }

  /** Next signInWithPassword call should succeed with this email. */
  succeedLogin(email = 'officer@dar.gov.ph') {
    this.authResult = { ok: true, email };
  }

  /** Next signInWithPassword call should fail with this message. */
  failLogin(message = 'Invalid login credentials') {
    this.authResult = { ok: false, message };
  }

  /** The next write (POST/DELETE) to any table returns an error. */
  queueWriteFailure(message) {
    this._failNextWrite = true;
    this._failMessage = message || this._failMessage;
  }

  async install() {
    const page = this.page;

    await page.route(`${this.url}/auth/v1/token**`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const result = this.authResult;
      if (!result) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'invalid_request', error_description: 'Test did not configure an auth mock' }),
        });
      }
      if (result.ok) {
        const now = Math.floor(Date.now() / 1000);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'test-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: now + 3600,
            refresh_token: 'test-refresh-token',
            user: {
              id: 'test-user-id',
              email: result.email,
              aud: 'authenticated',
              role: 'authenticated',
              created_at: new Date().toISOString(),
            },
          }),
        });
      }
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: result.message }),
      });
    });

    await page.route(`${this.url}/auth/v1/logout**`, (route) => route.fulfill({ status: 204, body: '' }));

    // Prevent the realtime subscription from trying (and retrying) to reach
    // the real internet — accept the socket and leave it idle.
    if (typeof page.routeWebSocket === 'function') {
      await page.routeWebSocket(`${this.url.replace('https://', 'wss://')}/realtime/v1/**`, () => {});
    }

    await page.route(`${this.url}/rest/v1/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const table = url.pathname.replace('/rest/v1/', '');
      const method = req.method();

      if (method === 'GET') {
        this.requests.push({ table, method, body: null });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(this.tables[table] || []) });
      }

      let parsed = null;
      try {
        parsed = JSON.parse(req.postData() || 'null');
      } catch {
        parsed = null;
      }
      const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      this.requests.push({ table, method, body: rows });

      if (this._failNextWrite) {
        this._failNextWrite = false;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: this._failMessage }),
        });
      }

      const current = this.tables[table] || (this.tables[table] = []);

      if (method === 'POST') {
        const saved = rows.map((r) => {
          const existing = r.id != null ? current.find((x) => x.id === r.id) : null;
          const row = { id: r.id ?? `mock-${Math.random().toString(36).slice(2, 9)}`, ...r };
          if (existing) Object.assign(existing, row);
          else current.unshift(row);
          return row;
        });
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(saved) });
      }

      if (method === 'DELETE') {
        const idFilter = url.searchParams.get('id');
        const id = idFilter && idFilter.startsWith('eq.') ? idFilter.slice(3) : null;
        const removed = current.filter((r) => String(r.id) === id);
        this.tables[table] = current.filter((r) => String(r.id) !== id);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(removed) });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
  }
}

module.exports = { SupabaseMock, SUPABASE_URL };
