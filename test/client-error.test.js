import assert from 'node:assert/strict';
import test from 'node:test';

import {GrafanaClient} from '../src/grafana/client.js';

test('downstream datasource errors are actionable without leaking its address', async () => {
  const originalFetch = globalThis.fetch;
  const originalUser = process.env.GRAFANA_USERNAME;
  const originalPassword = process.env.GRAFANA_PASSWORD;
  process.env.GRAFANA_USERNAME = 'test-user';
  process.env.GRAFANA_PASSWORD = 'test-password';
  globalThis.fetch = async url => {
    if (new URL(url).pathname === '/login') {
      const headers = new Headers();
      headers.append('Set-Cookie', 'grafana_session=one; Path=/; HttpOnly');
      headers.append('Set-Cookie', `grafana_session_expiry=${Math.floor(Date.now() / 1000) + 3600}; Path=/`);
      return new Response('{}', {headers});
    }
    return new Response(JSON.stringify({results: {A: {
      error: 'dial tcp: lookup private-backend on dns: no such host',
      status: 502,
    }}}), {status: 400});
  };

  try {
    const client = new GrafanaClient({baseUrl: 'http://error-test.invalid', orgId: 1});
    await assert.rejects(client.request('/api/ds/query'), error => (
      /datasource backend cannot be reached/i.test(error.message)
      && !error.message.includes('private-backend')
    ));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUser === undefined) delete process.env.GRAFANA_USERNAME;
    else process.env.GRAFANA_USERNAME = originalUser;
    if (originalPassword === undefined) delete process.env.GRAFANA_PASSWORD;
    else process.env.GRAFANA_PASSWORD = originalPassword;
  }
});
