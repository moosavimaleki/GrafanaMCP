import assert from 'node:assert/strict';
import test from 'node:test';

import {GrafanaClient} from '../src/grafana/client.js';

function response(payload, {status = 200, cookies = []} = {}) {
  const headers = new Headers({'Content-Type': 'application/json'});
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(payload), {status, headers});
}

async function withCredentials(run) {
  const originalUser = process.env.GRAFANA_USERNAME;
  const originalPassword = process.env.GRAFANA_PASSWORD;
  process.env.GRAFANA_USERNAME = 'test-user';
  process.env.GRAFANA_PASSWORD = 'test-password';
  try {
    await run();
  } finally {
    if (originalUser === undefined) delete process.env.GRAFANA_USERNAME;
    else process.env.GRAFANA_USERNAME = originalUser;
    if (originalPassword === undefined) delete process.env.GRAFANA_PASSWORD;
    else process.env.GRAFANA_PASSWORD = originalPassword;
  }
}

test('session cookies from ordinary responses replace the cookie used next', async () => {
  const originalFetch = globalThis.fetch;
  const seenCookies = [];
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/login') return response({message: 'Logged in'}, {cookies: [
      'grafana_session=one; Path=/; HttpOnly',
      `grafana_session_expiry=${Math.floor(Date.now() / 1000) + 3600}; Path=/`,
    ]});
    seenCookies.push(options.headers.Cookie);
    if (pathname === '/rotate') return response({ok: true}, {cookies: [
      'grafana_session=two; Path=/; HttpOnly',
      `grafana_session_expiry=${Math.floor(Date.now() / 1000) + 7200}; Path=/`,
    ]});
    return response({ok: true});
  };

  try {
    await withCredentials(async () => {
      const client = new GrafanaClient({baseUrl: 'http://cookie-test.invalid', orgId: 1});
      await client.login();
      await client.request('/rotate');
      await client.request('/after');
      assert.match(seenCookies[0], /grafana_session=one/);
      assert.match(seenCookies[1], /grafana_session=two/);
      assert.match(seenCookies[1], /grafana_session_expiry=/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('session rotates before expiry and uses the replacement cookie', async () => {
  const originalFetch = globalThis.fetch;
  let loginCount = 0;
  let rotationCount = 0;
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/login') {
      loginCount += 1;
      return response({message: 'Logged in'}, {cookies: [
        'grafana_session=old; Path=/; HttpOnly',
        `grafana_session_expiry=${Math.floor(Date.now() / 1000) + 10}; Path=/`,
      ]});
    }
    if (pathname === '/api/user/auth-tokens/rotate') {
      rotationCount += 1;
      assert.match(options.headers.Cookie, /grafana_session=old/);
      return response({ok: true}, {cookies: [
        'grafana_session=new; Path=/; HttpOnly',
        `grafana_session_expiry=${Math.floor(Date.now() / 1000) + 3600}; Path=/`,
      ]});
    }
    assert.match(options.headers.Cookie, /grafana_session=new/);
    return response({pathname});
  };

  try {
    await withCredentials(async () => {
      const client = new GrafanaClient({baseUrl: 'http://rotation-test.invalid', orgId: 1});
      await client.login();
      assert.deepEqual(await client.request('/dashboard'), {pathname: '/dashboard'});
      assert.equal(loginCount, 1);
      assert.equal(rotationCount, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('concurrent rotate failures share one fallback login', async () => {
  const originalFetch = globalThis.fetch;
  let loginCount = 0;
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/login') {
      loginCount += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      const session = loginCount === 1 ? 'stale' : 'shared';
      const lifetime = session === 'stale' ? 10 : 3600;
      return response({message: 'Logged in'}, {cookies: [
        `grafana_session=${session}; Path=/; HttpOnly`,
        `grafana_session_expiry=${Math.floor(Date.now() / 1000) + lifetime}; Path=/`,
      ]});
    }
    if (pathname === '/api/user/auth-tokens/rotate') {
      return response({message: 'Unauthorized'}, {status: 401});
    }
    return options.headers.Cookie?.includes('grafana_session=shared')
      ? response({pathname})
      : response({message: 'Unauthorized'}, {status: 401});
  };

  try {
    await withCredentials(async () => {
      const client = new GrafanaClient({baseUrl: 'http://concurrency-test.invalid', orgId: 1});
      await client.login();
      const results = await Promise.all([client.request('/a'), client.request('/b')]);
      assert.deepEqual(results, [{pathname: '/a'}, {pathname: '/b'}]);
      assert.equal(loginCount, 2);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
