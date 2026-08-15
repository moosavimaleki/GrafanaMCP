import * as z from 'zod/v4';

import {query as runQuery} from '../grafana/api.js';
import {buildQueryPayload} from '../grafana/query.js';
import {summarizeQueryResult} from '../grafana/results.js';
import {
  baseInput,
  grafanaClient,
  handle,
  METRICSQL_DOC_URL,
  result,
} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};
const documentation = {metricsql: METRICSQL_DOC_URL};

async function execute(args, item) {
  const payload = buildQueryPayload({
    datasourceUid: args.datasource_uid,
    from: args.from,
    to: args.to,
    maxDataPoints: args.max_data_points,
    intervalMs: args.interval_ms,
    queries: [item],
  });
  const response = await runQuery(grafanaClient(args), payload);
  return {payload, response};
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
    const {payload, response} = await execute(args, {refId: 'A', expr});
    return result({
      request: {
        datasourceUid: args.datasource_uid,
        expr,
        from: payload.from,
        to: payload.to,
      },
      results: summarizeQueryResult(response),
      documentation,
    });
  }));

  server.registerTool('query_prometheus', {
    title: 'Query Prometheus-compatible datasource',
    description: 'Run read-only PromQL or MetricsQL and return compact frame summaries.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      expr: z.string().min(1),
      from: z.string().optional(),
      to: z.string().optional(),
      instant: z.boolean().default(false),
      legend_format: z.string().default(''),
      max_data_points: z.coerce.number().int().min(1).max(5000).default(300),
      interval_ms: z.coerce.number().int().min(1).optional(),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const {payload, response} = await execute(args, {
      refId: 'A',
      expr: args.expr,
      instant: args.instant,
      range: !args.instant,
      legendFormat: args.legend_format,
    });
    return result({
      request: {
        datasourceUid: args.datasource_uid,
        expr: args.expr,
        from: payload.from,
        to: payload.to,
        instant: args.instant,
      },
      results: summarizeQueryResult(response),
      documentation,
    });
  }));
}
