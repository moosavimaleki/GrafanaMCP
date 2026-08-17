import assert from 'node:assert/strict';
import test from 'node:test';

import {compactText, result} from '../src/mcp/common.js';

test('compact text uses tabular notation for uniform object arrays', () => {
  const value = {
    count: 2,
    rows: [
      {id: 1, name: 'one', labels: {env: 'prod'}},
      {id: 2, name: 'two, too', labels: {env: 'dev'}},
    ],
  };

  assert.equal(compactText(value), [
    'count: 2',
    'rows[2]{id,name,labels{env}}:',
    '  1,one,prod',
    '  2,"two, too",dev',
  ].join('\n'));
});

test('compact text renders nested objects and omits undefined properties', () => {
  assert.equal(compactText({
    request: {expr: 'up', optional: undefined},
    values: ['a', 'b'],
    empty: [],
  }), [
    'request:',
    '  expr: up',
    'values[2]: a,b',
    'empty: []',
  ].join('\n'));
});

test('MCP results do not duplicate the payload as structured content', () => {
  assert.deepEqual(result({ok: true}), {
    content: [{type: 'text', text: 'ok: true'}],
  });
});
