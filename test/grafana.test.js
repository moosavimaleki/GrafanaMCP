import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jsonPointer,
} from '../src/grafana/dashboard.js';
import {GrafanaClient} from '../src/grafana/client.js';
import {GrafanaError} from '../src/grafana/error.js';
import {buildQueryPayload} from '../src/grafana/query.js';
import {rowsFromFrames} from '../src/grafana/results.js';
import {resolveGrafanaTime} from '../src/grafana/time.js';

function response(payload, {status = 200, cookies = []} = {}) {
  const headers = new Headers({'Content-Type': 'application/json'});
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(payload), {status, headers});
}

test('relative dashboard times become epoch milliseconds and drive intervalMs', () => {
  const now = 2_000_000_000_000;
  const payload = buildQueryPayload({
    datasourceUid: 'metrics',
    from: 'now-30m',
    to: 'now',
    maxDataPoints: 300,
    now,
    queries: [{expr: 'up'}],
  });

  assert.equal(payload.from, String(now - 30 * 60 * 1000));
  assert.equal(payload.to, String(now));
  assert.equal(payload.queries[0].intervalMs, 6000);
});

test('time parser supports epoch and ISO input and rejects unknown date math', () => {
  assert.equal(resolveGrafanaTime('1234', 0, 10), 1234);
  assert.equal(resolveGrafanaTime('1970-01-01T00:00:02.000Z', 0, 10), 2000);
  assert.throws(() => resolveGrafanaTime('now/d', 0, 10), GrafanaError);
});

test('query range cannot run backwards', () => {
  assert.throws(() => buildQueryPayload({
    datasourceUid: 'metrics',
    from: '2000',
    to: '1000',
    queries: [{expr: 'up'}],
  }), /start time/);
});

test('RFC 6901 root and empty-property pointers remain distinct', () => {
  const document = {'': 'empty property', panels: [{title: 'first'}]};
  assert.equal(jsonPointer(document, ''), document);
  assert.equal(jsonPointer(document, '/'), 'empty property');
  assert.equal(jsonPointer(document, '/panels/0/title'), 'first');
});

test('log row extraction can be restricted to VictoriaLogs ref IDs', () => {
  const data = {
    results: {
      metric: {frames: [{schema: {fields: [{name: 'Value'}]}, data: {values: [[1]]}}]},
      logs: {frames: [{schema: {fields: [{name: 'Line'}]}, data: {values: [['hello']]}}]},
    },
  };
  assert.deepEqual(rowsFromFrames(data, 10, new Set(['logs'])), [
    {refId: 'logs', Line: 'hello'},
  ]);
});

test('session cookies from ordinary responses replace the cookie used next', async () => {
  const originalFetch = globalThis.fetch;
  const originalUser = process.env.GRAFANA_USERNAME;
  const originalPassword = process.env.GRAFANA_PASSWORD;
  process.env.GRAFANA_USERNAME = 'test-user';
  process.env.GRAFANA_PASSWORD = 'test-password';
  const seenCookies = [];

  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/login') {
      return response({message: 'Logged in'}, {cookies: [
        'grafana_session=one; Path=/; HttpOnly',
        'grafana_session_expiry=100; Path=/',
      ]});
    }
    seenCookies.push(options.headers.Cookie);
    if (pathname === '/rotate') {
      return response({ok: true}, {cookies: [
        'grafana_session=two; Path=/; HttpOnly',
        'grafana_session_expiry=200; Path=/',
      ]});
    }
    return response({ok: true});
  };

  try {
    const client = new GrafanaClient({baseUrl: 'http://cookie-test.invalid', orgId: 1});
    await client.login();
    await client.request('/rotate');
    await client.request('/after');
    assert.match(seenCookies[0], /grafana_session=one/);
    assert.match(seenCookies[1], /grafana_session=two/);
    assert.match(seenCookies[1], /grafana_session_expiry=200/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUser === undefined) delete process.env.GRAFANA_USERNAME;
    else process.env.GRAFANA_USERNAME = originalUser;
    if (originalPassword === undefined) delete process.env.GRAFANA_PASSWORD;
    else process.env.GRAFANA_PASSWORD = originalPassword;
  }
});

test('concurrent 401 responses share one automatic login', async () => {
  const originalFetch = globalThis.fetch;
  const originalUser = process.env.GRAFANA_USERNAME;
  const originalPassword = process.env.GRAFANA_PASSWORD;
  process.env.GRAFANA_USERNAME = 'test-user';
  process.env.GRAFANA_PASSWORD = 'test-password';
  let loginCount = 0;

  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/login') {
      loginCount += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      return response({message: 'Logged in'}, {cookies: ['grafana_session=shared; Path=/; HttpOnly']});
    }
    return options.headers.Cookie?.includes('grafana_session=shared')
      ? response({pathname})
      : response({message: 'Unauthorized'}, {status: 401});
  };

  try {
    const client = new GrafanaClient({baseUrl: 'http://concurrency-test.invalid', orgId: 1});
    const results = await Promise.all([client.request('/a'), client.request('/b')]);
    assert.deepEqual(results, [{pathname: '/a'}, {pathname: '/b'}]);
    assert.equal(loginCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUser === undefined) delete process.env.GRAFANA_USERNAME;
    else process.env.GRAFANA_USERNAME = originalUser;
    if (originalPassword === undefined) delete process.env.GRAFANA_PASSWORD;
    else process.env.GRAFANA_PASSWORD = originalPassword;
  }
});
