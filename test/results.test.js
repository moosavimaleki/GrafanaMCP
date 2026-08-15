import assert from 'node:assert/strict';
import test from 'node:test';

import {summarizeQueryResult} from '../src/grafana/results.js';

test('metric summaries preserve every numeric series and its range', () => {
  const response = {
    results: {
      A: {
        frames: [{
          schema: {
            fields: [
              {name: 'Time', type: 'time'},
              {name: 'Value', type: 'number', labels: {instance: 'one'}},
              {name: 'Value', type: 'number', labels: {instance: 'two'}},
            ],
          },
          data: {
            values: [
              [1000, 2000, 3000],
              [1, 2, 3],
              [10, null, 30],
            ],
          },
        }],
      },
    },
  };

  const summary = summarizeQueryResult(response).A;
  assert.equal(summary.seriesCount, 2);
  assert.equal(summary.numericPointCount, 5);
  assert.deepEqual(summary.series[0], {
    name: 'Value',
    labels: {instance: 'one'},
    pointCount: 3,
    first: {value: 1, time: 1000},
    latest: {value: 3, time: 3000},
    min: 1,
    max: 3,
    average: 2,
  });
  assert.equal(summary.series[1].latest.value, 30);
  assert.equal(summary.series[1].average, 20);
});

test('metric summaries report series truncation without losing total counts', () => {
  const response = {
    results: {
      A: {
        frames: [{
          schema: {fields: [
            {name: 'one', type: 'number'},
            {name: 'two', type: 'number'},
          ]},
          data: {values: [[1], [2]]},
        }],
      },
    },
  };
  const summary = summarizeQueryResult(response, 1).A;
  assert.equal(summary.seriesCount, 2);
  assert.equal(summary.returnedSeriesCount, 1);
  assert.equal(summary.seriesTruncated, true);
});
