import * as z from 'zod/v4';

import {query as runQuery} from '../grafana/api.js';
import {buildQueryPayload} from '../grafana/query.js';
import {summarizeQueryResult} from '../grafana/results.js';
import {
  baseInput,
  grafanaClient,
  handle,
  result,
} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};
const queryInput = baseInput.extend({
  datasource_uid: z.string().min(1),
  expr: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  instant: z.boolean().default(false),
  legend_format: z.string().default(''),
  max_data_points: z.coerce.number().int().min(1).max(5000).default(300),
  max_series: z.coerce.number().int().min(1).max(1000).default(100),
  detail: z.enum(['compact', 'stats']).default('compact')
    .describe('Use stats only when first/min/max/average values are needed.'),
  interval_ms: z.coerce.number().int().min(1).optional(),
});

async function execute(args, item) {
  const payload = buildQueryPayload({
    datasourceUid: args.datasource_uid,
    from: args.from,
    to: args.to,
    maxDataPoints: args.max_data_points,
    intervalMs: args.interval_ms,
    queries: [item],
  });
  return runQuery(grafanaClient(args), payload);
}

function metricQueryResult(args, response) {
  return result(summarizeQueryResult(response, args.max_series, {
    includeStats: args.detail === 'stats',
  }).A ?? {});
}

async function queryMetricDatasource(args) {
  const response = await execute(args, {
    refId: 'A',
    expr: args.expr,
    instant: args.instant,
    range: !args.instant,
    legendFormat: args.legend_format,
  });
  return metricQueryResult(args, response);
}

export function registerMetricQueryTools(server) {
  server.registerTool('query_prometheus_histogram', {
    title: 'Query Prometheus histogram percentile',
    description: 'Calculate histogram_quantile through Grafana.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      metric: z.string().regex(/^[A-Za-z_:][A-Za-z0-9_:]*$/),
      percentile: z.coerce.number().min(0).max(1).default(0.95),
      selectors: z.string().default(''),
      rate_window: z.string().default('5m'),
      from: z.string().optional(),
      to: z.string().optional(),
      max_data_points: z.coerce.number().int().min(1).max(5000).default(300),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const selector = args.selectors.trim();
    const labels = selector
      ? (selector.startsWith('{') && selector.endsWith('}')
        ? selector
        : `{${selector}}`)
      : '';
    const expr = [
      `histogram_quantile(${args.percentile}, sum by (le) (rate(`,
      `${args.metric}_bucket${labels}[${args.rate_window}])))`,
    ].join('');
    const response = await execute(args, {refId: 'A', expr});
    return result(summarizeQueryResult(response).A ?? {});
  }));

  server.registerTool('query_prometheus', {
    title: 'Query Prometheus-compatible datasource',
    description: 'Run read-only PromQL or MetricsQL and return compact frame summaries.',
    inputSchema: queryInput,
    annotations: readOnly,
  }, handle(queryMetricDatasource));

  server.registerTool('query_victoriametrics', {
    title: 'Query VictoriaMetrics',
    description: 'Run read-only MetricsQL through Grafana’s VictoriaMetrics datasource.',
    inputSchema: queryInput,
    annotations: readOnly,
  }, handle(queryMetricDatasource));
}
