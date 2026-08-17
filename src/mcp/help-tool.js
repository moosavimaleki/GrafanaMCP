import * as z from 'zod/v4';

import {
  handle,
  LOGSQL_DOC_URL,
  METRICSQL_DOC_URL,
  result,
} from './common.js';

const guidance = {
  workflow: {
    steps: [
      'Use list_datasources to find a datasource UID.',
      'Use discovery tools to find metric, label, or log field names.',
      'Use an instant metric query for one current value per series.',
      'Use a range query only when trend statistics are required.',
      'Use dashboard property and panel tools instead of fetching full dashboard JSON.',
    ],
  },
  metricsql: {
    tools: ['query_victoriametrics', 'query_prometheus', 'query_prometheus_histogram'],
    tips: [
      'Aggregate by only the labels needed by the answer.',
      'Use max_series to bound high-cardinality responses.',
      'Keep detail=compact unless first/min/max/average statistics are needed.',
      'Use MetricsQL aggregate limit N or topk functions only when truncation matches intent.',
    ],
    docs: METRICSQL_DOC_URL,
  },
  logsql: {
    tools: ['query_victorialogs', 'list_victorialogs_fields', 'list_victorialogs_field_values'],
    tips: [
      'Discover field names and values before building a narrow filter.',
      'Use max_lines to bound returned log rows.',
      'Prefer stats or statsRange when raw log lines are not required.',
    ],
    docs: LOGSQL_DOC_URL,
  },
  output: {
    format: 'TOON',
    notation: 'rows[2]{name,value}: declares two rows and writes column names once.',
    behavior: [
      'Query inputs and documentation URLs are not repeated in ordinary responses.',
      'Instant series contain only name, labels, value, and time by default.',
      'A display name is omitted when it only repeats the same label set.',
      'A timestamp shared by every compact series is written once.',
      'Compact range series contain latest value, time, and point count.',
      'Set detail=stats to include first/latest values and times, min, max, and average.',
      'A truncated response explicitly reports totalSeries, returnedSeries, and truncated.',
    ],
  },
};

export function registerHelpTool(server) {
  server.registerTool('grafana_help', {
    title: 'Grafana MCP help',
    description: 'Return on-demand workflow, query-language, and compact-output guidance.',
    inputSchema: z.object({
      topic: z.enum(['all', ...Object.keys(guidance)]).default('all'),
    }),
    annotations: {readOnlyHint: true, openWorldHint: false},
  }, handle(async args => result(
    args.topic === 'all' ? guidance : {[args.topic]: guidance[args.topic]},
  )));
}
