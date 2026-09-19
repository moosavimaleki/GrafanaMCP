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
    const client = new GrafanaClient({baseUrl: 'https://grafana.example.test', orgId: 1});
    client.proxySettings = {mode: 'always', uri: 'http://127.0.0.1:3128/'};
    client.proxyDispatcher = Promise.resolve(dispatcher);
    await client.fetch('https://grafana.example.test/api/health', {});
    assert.equal(received, dispatcher);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auto mode retries through the configured proxy after a direct network failure', async () => {
  const originalFetch = globalThis.fetch;
  const dispatcher = {};
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options);
    if (calls.length === 1) throw new TypeError('network unreachable');
    return new Response('{}');
  };

  try {
    const client = new GrafanaClient({baseUrl: 'https://grafana.example.test', orgId: 1});
    client.proxySettings = {mode: 'auto', uri: 'http://127.0.0.1:3128/'};
    client.proxyDispatcher = Promise.resolve(dispatcher);
    await client.fetch('https://grafana.example.test/api/health', {});
    await client.fetch('https://grafana.example.test/api/health', {});
    assert.equal(calls.length, 3);
    assert.equal(calls[0].dispatcher, undefined);
    assert.equal(calls[1].dispatcher, dispatcher);
    assert.equal(calls[2].dispatcher, dispatcher);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
