import * as z from 'zod/v4';

import {dashboard, query as runQuery} from '../grafana/api.js';
import {jsonPointer, panelList, queryTargets} from '../grafana/dashboard.js';
import {buildQueryPayload} from '../grafana/query.js';
import {rowsFromFrames, summarizeQueryResult} from '../grafana/results.js';
import {
  baseInput,
  GrafanaError,
  grafanaClient,
  handle,
  LOGSQL_DOC_URL,
  result,
} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};
const variableSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
).optional();

export function registerDashboardTools(server) {
  server.registerTool('get_dashboard_property', {
    title: 'Get dashboard property',
    description: 'Extract a narrow dashboard value with an RFC 6901 JSON Pointer.',
    inputSchema: baseInput.extend({
      dashboard_uid: z.string().min(1),
      json_pointer: z.string().default(''),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const loaded = await dashboard(grafanaClient(args), args.dashboard_uid);
    const value = jsonPointer(loaded.dashboard, args.json_pointer);
    if (value === undefined) {
      throw new GrafanaError(`No value exists at ${args.json_pointer}.`);
    }
    return result({
      dashboardUid: args.dashboard_uid,
      jsonPointer: args.json_pointer,
      value,
    });
  }));

  server.registerTool('list_dashboard_panels', {
    title: 'List dashboard panels',
    description: 'List panels and saved metric or log targets without executing them.',
    inputSchema: baseInput.extend({
      dashboard_uid: z.string().min(1),
      variables: variableSchema,
    }),
    annotations: readOnly,
  }, handle(async args => {
    const loaded = await dashboard(grafanaClient(args), args.dashboard_uid);
    const panels = panelList(loaded.dashboard).map(panel => ({
      id: panel.id,
      title: panel.title,
      type: panel.type,
      row: panel.rowTitle,
      description: panel.description,
      targets: queryTargets(panel, loaded.dashboard, args.variables).map(target => ({
        refId: target.refId,
        datasourceUid: target.datasourceUid,
        datasourceType: target.datasourceType,
        expr: target.expr,
        legendFormat: target.legendFormat,
        instant: target.instant,
        range: target.range,
        queryType: target.queryType,
        maxLines: target.maxLines,
      })),
    }));
    return result({dashboardUid: args.dashboard_uid, panels});
  }));

  server.registerTool('query_dashboard_panel', {
    title: 'Query dashboard panel',
    description: 'Execute every saved metric or VictoriaLogs target in one panel.',
    inputSchema: baseInput.extend({
      dashboard_uid: z.string().min(1),
      panel_id: z.coerce.number().int().positive(),
      from: z.string().optional(),
      to: z.string().optional(),
      variables: variableSchema,
      max_data_points: z.coerce.number().int().min(1).max(5000).default(300),
      max_log_rows: z.coerce.number().int().min(1).max(500).default(100),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const client = grafanaClient(args);
    const loaded = await dashboard(client, args.dashboard_uid);
    const panel = panelList(loaded.dashboard).find(item => item.id === args.panel_id);
    if (!panel) throw new GrafanaError(`Panel ${args.panel_id} was not found.`);

    const targets = queryTargets(panel, loaded.dashboard, args.variables);
    if (targets.length === 0) {
      return result({
        dashboardUid: args.dashboard_uid,
        panelId: args.panel_id,
        state: 'no_query_targets',
      });
    }
    const response = await runQuery(client, buildQueryPayload({
      queries: targets,
      from: args.from,
      to: args.to,
      maxDataPoints: args.max_data_points,
    }));
    const output = {
      dashboardUid: args.dashboard_uid,
      panel: {id: panel.id, title: panel.title, type: panel.type},
      targets,
      results: summarizeQueryResult(response),
    };
    const logRefs = new Set(
      targets
        .filter(target => target.datasourceType === 'victoriametrics-logs-datasource')
        .map(target => target.refId),
    );
    if (logRefs.size > 0) {
      output.logs = rowsFromFrames(response, args.max_log_rows, logRefs);
      output.documentation = {logsql: LOGSQL_DOC_URL};
    }
    return result(output);
  }));
}
