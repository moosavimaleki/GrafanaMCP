import * as z from 'zod/v4';

import {datasourceProxyForm, query as runQuery} from '../grafana/api.js';
import {buildQueryPayload} from '../grafana/query.js';
import {rowsFromFrames, summarizeQueryResult} from '../grafana/results.js';
import {
  baseInput,
  grafanaClient,
  handle,
  LOGSQL_DOC_URL,
  result,
} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};
const documentation = {logsql: LOGSQL_DOC_URL};

export function registerLogTools(server) {
  server.registerTool('query_victorialogs', {
    title: 'Query VictoriaLogs',
    description: 'Run read-only LogsQL and return frame metadata and rows.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      expr: z.string().min(1),
      query_type: z.enum(['range', 'stats', 'statsRange']).default('range'),
      from: z.string().optional(),
      to: z.string().optional(),
      max_lines: z.coerce.number().int().min(1).max(5000).default(100),
      max_data_points: z.coerce.number().int().min(1).max(5000).default(300),
      legend_format: z.string().default(''),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const payload = buildQueryPayload({
      datasourceUid: args.datasource_uid,
      from: args.from,
      to: args.to,
      maxDataPoints: args.max_data_points,
      queries: [{
        refId: 'A',
        datasourceType: 'victoriametrics-logs-datasource',
        expr: args.expr,
        queryType: args.query_type,
        maxLines: args.max_lines,
        legendFormat: args.legend_format,
      }],
    });
    const response = await runQuery(grafanaClient(args), payload);
    return result({
      request: {
        datasourceUid: args.datasource_uid,
        expr: args.expr,
        queryType: args.query_type,
        from: payload.from,
        to: payload.to,
        maxLines: args.max_lines,
      },
      results: summarizeQueryResult(response),
      rows: rowsFromFrames(response, args.max_lines),
      documentation,
    });
  }));

  server.registerTool('list_victorialogs_fields', {
    title: 'List VictoriaLogs fields',
    description: 'Discover searchable VictoriaLogs field names through Grafana.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      query: z.string().default('*'),
      start: z.coerce.number().int().nonnegative().describe('Unix milliseconds.'),
      end: z.coerce.number().int().nonnegative().describe('Unix milliseconds.'),
      limit: z.coerce.number().int().min(1).max(10000).default(1000),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const data = await datasourceProxyForm(
      grafanaClient(args),
      args.datasource_uid,
      'select/logsql/field_names',
      {
        query: args.query,
        start: args.start,
        end: args.end,
        limit: args.limit,
      },
    );
    return result({
      datasourceUid: args.datasource_uid,
      fields: data.values ?? data.data ?? data,
      documentation,
    });
  }));

  server.registerTool('list_victorialogs_field_values', {
    title: 'List VictoriaLogs field values',
    description: 'Discover values for a VictoriaLogs field with an optional LogsQL filter.',
    inputSchema: baseInput.extend({
      datasource_uid: z.string().min(1),
      field: z.string().min(1),
      query: z.string().default('*'),
      start: z.coerce.number().int().nonnegative().describe('Unix milliseconds.'),
      end: z.coerce.number().int().nonnegative().describe('Unix milliseconds.'),
      limit: z.coerce.number().int().min(1).max(10000).default(1000),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const data = await datasourceProxyForm(
      grafanaClient(args),
      args.datasource_uid,
      'select/logsql/field_values',
      {
        query: args.query,
        start: args.start,
        end: args.end,
        field: args.field,
        limit: args.limit,
      },
    );
    return result({
      datasourceUid: args.datasource_uid,
      field: args.field,
      values: data.values ?? data.data ?? data,
      documentation,
    });
  }));
}
