import assert from 'node:assert/strict';
import test from 'node:test';

import {GrafanaClient} from '../src/grafana/client.js';
import {proxyDispatcher, proxySettings} from '../src/grafana/proxy.js';

test('direct mode is the default', () => {
  assert.deepEqual(proxySettings({}), {mode: 'direct'});
});

test('proxy mode requires an explicit proxy URL', () => {
  assert.throws(
    () => proxySettings({GRAFANA_PROXY_MODE: 'always'}),
    /Set GRAFANA_PROXY_URL/,
  );
});

test('auto mode requires an explicit proxy URL', () => {
  assert.deepEqual(proxySettings({
    GRAFANA_PROXY_MODE: 'auto',
    GRAFANA_PROXY_URL: 'http://127.0.0.1:3128',
  }), {mode: 'auto', uri: 'http://127.0.0.1:3128/'});
});

test('always mode constructs the configured proxy agent', () => {
  const agent = {};
  const dispatcher = proxyDispatcher(
    {mode: 'always', uri: 'http://127.0.0.1:3128/'},
    {createAgent: uri => ({agent, uri})},
  );
  assert.deepEqual(dispatcher, {agent, uri: 'http://127.0.0.1:3128/'});
});

test('direct mode never constructs a proxy agent', () => {
  const dispatcher = proxyDispatcher(
    {mode: 'direct'},
    {
      createAgent: () => { throw new Error('must not create an agent'); },
    },
  );
  assert.equal(dispatcher, undefined);
});

test('Grafana requests receive the resolved proxy dispatcher', async () => {
  const originalFetch = globalThis.fetch;
  const dispatcher = {};
  let received;
  globalThis.fetch = async (_url, options) => {
    received = options.dispatcher;
    return new Response('{}');
  };

  try {
    const client = new GrafanaClient({
      baseUrl: 'https://grafana.example.test',
      orgId: 1,
      proxyConfig: {mode: 'always', uri: 'http://127.0.0.1:3128/'},
    });
    client.proxyDispatcher = Promise.resolve(dispatcher);
    await client.fetch('https://grafana.example.test/api/health', {});
    assert.equal(received, dispatcher);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auto mode shares one route decision across Grafana tool calls', async () => {
  const originalFetch = globalThis.fetch;
  const dispatcher = {};
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url: String(url), dispatcher: options.dispatcher});
    if (!options.dispatcher) throw new TypeError('fetch failed');
    return new Response('{}');
  };

  try {
    const options = {
      baseUrl: 'https://shared-route.example.test',
      orgId: 1,
      proxyConfig: {mode: 'auto', uri: 'http://127.0.0.1:3128/'},
    };
    const first = new GrafanaClient(options);
    const second = new GrafanaClient(options);
    first.proxyDispatcher = Promise.resolve(dispatcher);
    second.proxyDispatcher = Promise.resolve(dispatcher);
    await first.fetch('https://shared-route.example.test/api/user', {});
    await second.fetch('https://shared-route.example.test/api/user', {});
    assert.equal(first.autoRoute, 'proxy');
    assert.equal(second.autoRoute, 'proxy');
    assert.equal(calls.length, 4);
    assert.equal(calls[0].url, 'https://shared-route.example.test/api/health');
    assert.equal(calls[0].dispatcher, undefined);
    assert.equal(calls[1].url, 'https://shared-route.example.test/api/health');
    assert.equal(calls[1].dispatcher, dispatcher);
    assert.equal(calls[2].dispatcher, dispatcher);
    assert.equal(calls[3].dispatcher, dispatcher);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auto mode switches from proxy to direct when the proxy fails', async () => {
  const originalFetch = globalThis.fetch;
  const dispatcher = {};
  let proxyAvailable = true;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options.dispatcher ? 'proxy' : 'direct');
    if (!options.dispatcher && calls.length === 1) throw new TypeError('fetch failed');
    if (options.dispatcher && !proxyAvailable) throw new TypeError('fetch failed');
    return new Response('{}');
  };

  try {
    const client = new GrafanaClient({
      baseUrl: 'https://route-change.example.test',
      orgId: 1,
      proxyConfig: {mode: 'auto', uri: 'http://127.0.0.1:3128/'},
    });
    client.proxyDispatcher = Promise.resolve(dispatcher);
    await client.fetch('https://route-change.example.test/api/user', {});
    proxyAvailable = false;
    await client.fetch('https://route-change.example.test/api/user', {});
    assert.equal(client.autoRoute, 'direct');
    assert.deepEqual(calls, ['direct', 'proxy', 'proxy', 'proxy', 'direct']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auto mode switches from direct to proxy when direct access fails later', async () => {
  const originalFetch = globalThis.fetch;
  const dispatcher = {};
  let directAvailable = true;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options.dispatcher ? 'proxy' : 'direct');
    if (!options.dispatcher && !directAvailable) throw new TypeError('fetch failed');
    return new Response('{}');
  };

  try {
    const client = new GrafanaClient({
      baseUrl: 'https://direct-failover.example.test',
      orgId: 1,
      proxyConfig: {mode: 'auto', uri: 'http://127.0.0.1:3128/'},
    });
    client.proxyDispatcher = Promise.resolve(dispatcher);
    await client.fetch('https://direct-failover.example.test/api/user', {});
    directAvailable = false;
    await client.fetch('https://direct-failover.example.test/api/user', {});
    assert.equal(client.autoRoute, 'proxy');
    assert.deepEqual(calls, ['direct', 'direct', 'direct', 'proxy']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auto mode does not switch routes for HTTP errors', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options.dispatcher ? 'proxy' : 'direct');
    return new Response('{}', {status: 503});
  };

  try {
    const client = new GrafanaClient({
      baseUrl: 'https://http-error.example.test',
      orgId: 1,
      proxyConfig: {mode: 'auto', uri: 'http://127.0.0.1:3128/'},
    });
    const response = await client.fetch('https://http-error.example.test/api/user', {});
    assert.equal(response.status, 503);
    assert.equal(client.autoRoute, 'direct');
    assert.deepEqual(calls, ['direct', 'direct']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auto mode rechecks direct access after using the proxy', async () => {
  const originalFetch = globalThis.fetch;
  const dispatcher = {};
  let directAvailable = false;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options.dispatcher ? 'proxy' : 'direct');
    if (!options.dispatcher && !directAvailable) throw new TypeError('fetch failed');
    return new Response('{}');
  };

  try {
    const client = new GrafanaClient({
      baseUrl: 'https://recheck.example.test',
      orgId: 1,
      proxyConfig: {mode: 'auto', uri: 'http://127.0.0.1:3128/'},
    });
    client.proxyDispatcher = Promise.resolve(dispatcher);
    await client.fetch('https://recheck.example.test/api/user', {});
    directAvailable = true;
    client.autoRouteState.lastDirectProbeAt = 0;
    await client.fetch('https://recheck.example.test/api/user', {});
    assert.equal(client.autoRoute, 'direct');
    assert.equal(calls.length, 5);
    assert.deepEqual(calls, ['direct', 'proxy', 'proxy', 'direct', 'direct']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
