import * as z from 'zod/v4';

import {datasourceResource} from '../grafana/api.js';
import {
  baseInput,
  grafanaClient,
  handle,
  result,
} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};

export function registerMetricDiscoveryTools(server) {
  server.registerTool('list_prometheus_label_values', {
    title: 'List Prometheus label values',
    description: 'Discover label values through a Prometheus or VictoriaMetrics data source.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      label: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      match: z.array(z.string().min(1)).optional(),
      start: z.coerce.number().int().nonnegative().optional(),
      end: z.coerce.number().int().nonnegative().optional(),
      limit: z.coerce.number().int().min(1).max(100000).default(1000),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const data = await datasourceResource(
      grafanaClient(args),
      args.datasource_uid,
      `api/v1/label/${encodeURIComponent(args.label)}/values`,
      {
        limit: args.limit,
        start: args.start,
        end: args.end,
        'match[]': args.match,
      },
    );
    return result({values: data.data ?? data});
  }));

  server.registerTool('list_prometheus_metric_names', {
    title: 'List Prometheus metric names',
    description: 'List metric names available through a Prometheus-compatible data source.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(100000).default(10000),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const data = await datasourceResource(
      grafanaClient(args),
      args.datasource_uid,
      'api/v1/label/__name__/values',
      {limit: args.limit},
    );
    return result({metricNames: data.data ?? data});
  }));

  server.registerTool('list_prometheus_label_names', {
    title: 'List Prometheus label names',
    description: 'List label names, optionally restricted by series selectors.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      match: z.array(z.string().min(1)).optional(),
      limit: z.coerce.number().int().min(1).max(100000).default(1000),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const data = await datasourceResource(
      grafanaClient(args),
      args.datasource_uid,
      'api/v1/labels',
      {limit: args.limit, 'match[]': args.match},
    );
    return result({labels: data.data ?? data});
  }));

  server.registerTool('list_prometheus_metric_metadata', {
    title: 'List Prometheus metric metadata',
    description: 'Read metric metadata, optionally for one metric name.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      metric: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100000).default(1000),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const data = await datasourceResource(
      grafanaClient(args),
      args.datasource_uid,
      'api/v1/metadata',
      {metric: args.metric, limit: args.limit},
    );
    return result({metadata: data.data ?? data});
  }));
}
