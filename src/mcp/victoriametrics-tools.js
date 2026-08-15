import * as z from 'zod/v4';

import {datasourceResource} from '../grafana/api.js';
import {
  baseInput,
  grafanaClient,
  handle,
  METRICSQL_DOC_URL,
  result,
} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};
const documentation = {metricsql: METRICSQL_DOC_URL};
const discoveryInput = baseInput.extend({
  datasource_uid: z.string().min(1),
  match: z.array(z.string().min(1)).optional(),
  start: z.coerce.number().int().nonnegative().optional(),
  end: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100000).default(1000),
});

function selectorParams(args) {
  return {
    limit: args.limit,
    start: args.start,
    end: args.end,
    'match[]': args.match,
  };
}

async function discover(args, resourcePath) {
  return datasourceResource(
    grafanaClient(args),
    args.datasource_uid,
    resourcePath,
    selectorParams(args),
  );
}

function values(data) {
  return data.data ?? data;
}

export function registerVictoriaMetricsTools(server) {
  server.registerTool('list_victoriametrics_namespaces', {
    title: 'List VictoriaMetrics namespaces',
    description: 'Discover namespace label values through a VictoriaMetrics datasource.',
    inputSchema: discoveryInput,
    annotations: readOnly,
  }, handle(async args => {
    const data = await discover(args, 'api/v1/label/namespace/values');
    return result({datasourceUid: args.datasource_uid, namespaces: values(data), documentation});
  }));

  server.registerTool('list_victoriametrics_metric_names', {
    title: 'List VictoriaMetrics metric names',
    description: 'Discover metric names through a VictoriaMetrics datasource.',
    inputSchema: discoveryInput,
    annotations: readOnly,
  }, handle(async args => {
    const data = await discover(args, 'api/v1/label/__name__/values');
    return result({datasourceUid: args.datasource_uid, metricNames: values(data), documentation});
  }));

  server.registerTool('list_victoriametrics_label_names', {
    title: 'List VictoriaMetrics label names',
    description: 'Discover label names through a VictoriaMetrics datasource.',
    inputSchema: discoveryInput,
    annotations: readOnly,
  }, handle(async args => {
    const data = await discover(args, 'api/v1/labels');
    return result({datasourceUid: args.datasource_uid, labels: values(data), documentation});
  }));

  server.registerTool('list_victoriametrics_label_values', {
    title: 'List VictoriaMetrics label values',
    description: 'Discover values for one VictoriaMetrics label.',
    inputSchema: discoveryInput.extend({
      label: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const data = await discover(
      args,
      `api/v1/label/${encodeURIComponent(args.label)}/values`,
    );
    return result({
      datasourceUid: args.datasource_uid,
      label: args.label,
      values: values(data),
      documentation,
    });
  }));
}
