import * as z from 'zod/v4';

import {dashboard, query as runQuery} from '../grafana/api.js';
import {panelList, queryTargets} from '../grafana/dashboard.js';
import {buildQueryPayload} from '../grafana/query.js';
import {rowsFromFrames, summarizeQueryResult} from '../grafana/results.js';
import {
  baseInput,
  grafanaClient,
  handle,
  result,
} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};

export function registerMonitorTool(server) {
  server.registerTool('monitor_dashboard', {
    title: 'Monitor dashboard',
    description: 'Run saved metric and VictoriaLogs targets across dashboard panels once.',
    inputSchema: baseInput.extend({
      dashboard_uid: z.string().min(1),
      panel_ids: z.array(z.coerce.number().int().positive()).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      variables: z.record(
        z.string(),
        z.union([z.string(), z.array(z.string())]),
      ).optional(),
      max_data_points: z.coerce.number().int().min(1).max(5000).default(300),
      max_queries: z.coerce.number().int().min(1).max(100).default(50),
      max_log_rows: z.coerce.number().int().min(1).max(500).default(100),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const client = grafanaClient(args);
    const loaded = await dashboard(client, args.dashboard_uid);
    const wanted = args.panel_ids ? new Set(args.panel_ids) : undefined;
    const targets = panelList(loaded.dashboard)
      .filter(panel => panel.type !== 'row' && (!wanted || wanted.has(panel.id)))
      .flatMap(panel =>
        queryTargets(panel, loaded.dashboard, args.variables).map((target, index) => ({
          ...target,
          refId: `P${panel.id}_${target.refId}_${index + 1}`,
          panelId: panel.id,
          panelTitle: panel.title,
        })),
      )
      .slice(0, args.max_queries);

    if (targets.length === 0) {
      return result({dashboardUid: args.dashboard_uid, state: 'no_query_targets'});
    }
    const response = await runQuery(client, buildQueryPayload({
      queries: targets,
      from: args.from,
      to: args.to,
      maxDataPoints: args.max_data_points,
    }));
    const summaries = summarizeQueryResult(response);
    const output = {
      dashboardUid: args.dashboard_uid,
      from: args.from,
      to: args.to,
      queryCount: targets.length,
      results: targets.map(target => ({
        panelId: target.panelId,
        panelTitle: target.panelTitle,
        expr: target.expr,
        result: summaries[target.refId],
      })),
    };
    const logRefs = new Set(
      targets
        .filter(target => target.datasourceType === 'victoriametrics-logs-datasource')
        .map(target => target.refId),
    );
    if (logRefs.size > 0) {
      output.logs = rowsFromFrames(response, args.max_log_rows, logRefs);
    }
    return result(output);
  }));
}
