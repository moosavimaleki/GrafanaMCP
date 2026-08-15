import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jsonPointer,
} from '../src/grafana/dashboard.js';
import {GrafanaError} from '../src/grafana/error.js';
import {buildQueryPayload} from '../src/grafana/query.js';
import {rowsFromFrames} from '../src/grafana/results.js';
import {resolveGrafanaTime} from '../src/grafana/time.js';

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
