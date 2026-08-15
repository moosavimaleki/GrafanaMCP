import * as z from 'zod/v4';

import {
  dashboard,
  dashboards,
  datasource,
  datasources,
  health,
} from '../grafana/api.js';
import {panelList} from '../grafana/dashboard.js';
import {
  baseInput,
  dashboardSummary,
  grafanaClient,
  handle,
  result,
  safeDatasource,
} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};

export function registerCoreTools(server) {
  server.registerTool('grafana_health', {
    title: 'Grafana health',
    description: 'Return Grafana health and version information.',
    inputSchema: baseInput,
    annotations: readOnly,
  }, handle(async args => result(await health(grafanaClient(args)))));

  server.registerTool('list_dashboards', {
    title: 'List dashboards',
    description: 'List dashboards, optionally filtered by text, tag, or folder UID.',
    inputSchema: baseInput.extend({
      query: z.string().optional(),
      tag: z.string().optional(),
      folder_uid: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      page: z.coerce.number().int().min(1).default(1),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const rows = await dashboards(grafanaClient(args), {
      query: args.query,
      tag: args.tag,
      folderUid: args.folder_uid,
      limit: args.limit,
      page: args.page,
    });
    return result({count: rows.length, dashboards: rows.map(dashboardSummary)});
  }));

  server.registerTool('get_dashboard', {
    title: 'Get dashboard',
    description: 'Return dashboard metadata, variables, panel count, time, and refresh settings.',
    inputSchema: baseInput.extend({dashboard_uid: z.string().min(1)}),
    annotations: readOnly,
  }, handle(async args => {
    const loaded = await dashboard(grafanaClient(args), args.dashboard_uid);
    const model = loaded.dashboard;
    return result({
      format: loaded.format,
      uid: args.dashboard_uid,
      title: model.title,
      tags: model.tags ?? [],
      refresh: model.refresh,
      time: model.time,
      variables: (model.templating?.list ?? []).map(variable => ({
        name: variable.name,
        type: variable.type,
        current: variable.current,
        includeAll: variable.includeAll,
        allValue: variable.allValue,
        datasource: variable.datasource,
        query: variable.query,
      })),
      panelCount: panelList(model).filter(panel => panel.type !== 'row').length,
    });
  }));

  server.registerTool('list_datasources', {
    title: 'List data sources',
    description: 'List accessible Grafana data sources without secret values.',
    inputSchema: baseInput,
    annotations: readOnly,
  }, handle(async args => {
    const rows = await datasources(grafanaClient(args));
    return result({datasources: rows.map(safeDatasource)});
  }));

  server.registerTool('get_datasource', {
    title: 'Get datasource',
    description: 'Get one data source by UID without secret values.',
    inputSchema: baseInput.extend({datasource_uid: z.string().min(1)}),
    annotations: readOnly,
  }, handle(async args => {
    const source = await datasource(grafanaClient(args), args.datasource_uid);
    return result({datasource: safeDatasource(source)});
  }));
}
