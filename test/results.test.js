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

  const summary = summarizeQueryResult(response, 100, {includeStats: true}).A;
  assert.equal(summary.series.length, 2);
  assert.deepEqual(summary.series[0], {
    name: 'Value',
    labels: {instance: 'one'},
    points: 3,
    first: 1,
    firstTime: 1000,
    latest: 3,
    latestTime: 3000,
    min: 1,
    max: 3,
    avg: 2,
  });
  assert.equal(summary.series[1].latest, 30);
  assert.equal(summary.series[1].avg, 20);
  assert.equal(summarizeQueryResult(response).A.time, 3000);
  assert.deepEqual(summarizeQueryResult(response).A.series[0], {
    name: 'Value',
    labels: {instance: 'one'},
    value: 3,
    points: 3,
  });
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
  assert.equal(summary.totalSeries, 2);
  assert.equal(summary.returnedSeries, 1);
  assert.equal(summary.truncated, true);
});

test('instant metric summaries omit redundant one-point statistics', () => {
  const response = {
    results: {A: {frames: [{
      schema: {fields: [
        {name: 'Time', type: 'time'},
        {name: 'Value', type: 'number', labels: {pool: 'primary'}},
      ]},
      data: {values: [[1234], [10.5]]},
    }] }},
  };

  assert.deepEqual(summarizeQueryResult(response).A, {
    time: 1234,
    series: [{name: 'Value', labels: {pool: 'primary'}, value: 10.5}],
  });
  assert.equal(summarizeQueryResult(response, 100, {includeStats: true})
    .A.series[0].min, 10.5);
});

test('metric summaries omit display names that only repeat labels', () => {
  const response = {results: {A: {frames: [{
    schema: {fields: [
      {name: 'Time', type: 'time'},
      {
        name: 'Value',
        type: 'number',
        labels: {pool: 'primary'},
        config: {displayNameFromDS: '{pool="primary"}'},
      },
    ]},
    data: {values: [[1234], [10.5]]},
  }]}}};

  assert.deepEqual(summarizeQueryResult(response).A, {
    time: 1234,
    series: [{labels: {pool: 'primary'}, value: 10.5}],
  });
});
