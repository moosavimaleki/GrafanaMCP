import * as z from 'zod/v4';

import {alertRules, annotations} from '../grafana/api.js';
import {baseInput, grafanaClient, handle, result} from './common.js';

const readOnly = {readOnlyHint: true, openWorldHint: false};

export function registerMetaTools(server) {
  server.registerTool('list_annotations', {
    title: 'List annotations',
    description: 'Read annotations for a time range, dashboard, and optional tags.',
    inputSchema: baseInput.extend({
      from: z.coerce.number().int().nonnegative().describe('Unix milliseconds.'),
      to: z.coerce.number().int().nonnegative().describe('Unix milliseconds.'),
      dashboard_uid: z.string().optional(),
      tags: z.array(z.string()).optional(),
      match_any: z.boolean().default(false),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const rows = await annotations(grafanaClient(args), {
      from: args.from,
      to: args.to,
      dashboardUid: args.dashboard_uid,
      tags: args.tags,
      matchAny: args.match_any,
      limit: args.limit,
    });
    return result({count: rows.length, annotations: rows});
  }));

  server.registerTool('grafana_deeplink', {
    title: 'Generate Grafana deeplink',
    description: 'Generate a dashboard or panel URL with time and variable filters.',
    inputSchema: baseInput.extend({
      dashboard_uid: z.string().min(1),
      panel_id: z.coerce.number().int().positive().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      variables: z.record(z.string(), z.union([z.string(), z.array(z.string())]))
        .optional(),
    }),
    annotations: readOnly,
  }, handle(async args => {
    const client = grafanaClient(args);
    const url = new URL(`/d/${encodeURIComponent(args.dashboard_uid)}`, `${client.baseUrl}/`);
    if (args.panel_id) url.searchParams.set('viewPanel', String(args.panel_id));
    if (args.from) url.searchParams.set('from', args.from);
    if (args.to) url.searchParams.set('to', args.to);
    for (const [name, value] of Object.entries(args.variables ?? {})) {
      url.searchParams.set(`var-${name}`, Array.isArray(value) ? value.join(',') : value);
    }
    return result({url: url.toString()});
  }));

  server.registerTool('list_alert_rules', {
    title: 'List Grafana alert rules',
    description: 'Read Grafana-managed alert rules, optionally for one dashboard.',
    inputSchema: baseInput.extend({dashboard_uid: z.string().optional()}),
    annotations: readOnly,
  }, handle(async args =>
    result(await alertRules(grafanaClient(args), args.dashboard_uid)),
  ));
}
