import * as z from 'zod/v4';
import {encode} from '@toon-format/toon';

import {GrafanaClient} from '../grafana/client.js';
export {GrafanaError} from '../grafana/error.js';

export const METRICSQL_DOC_URL =
  'https://docs.victoriametrics.com/victoriametrics/metricsql/';
export const LOGSQL_DOC_URL =
  'https://docs.victoriametrics.com/victorialogs/logsql/';

export const baseInput = z.object({
  base_url: z.string().url().optional()
    .describe('Grafana base URL; defaults to GRAFANA_BASE_URL.'),
  org_id: z.coerce.number().int().positive().optional()
    .describe('Grafana organization ID; defaults to 1.'),
});

export function grafanaClient(args) {
  return new GrafanaClient({baseUrl: args.base_url, orgId: args.org_id});
}

export function compactText(value) {
  const json = JSON.stringify(value);
  if (json === undefined) return 'null';
  return encode(JSON.parse(json)) || '{}';
}

export function result(value) {
  return {
    content: [{type: 'text', text: compactText(value)}],
  };
}

function failure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {content: [{type: 'text', text: message}], isError: true};
}

export function handle(callback) {
  return async args => {
    try {
      return await callback(args);
    } catch (error) {
      return failure(error);
    }
  };
}

export function dashboardSummary(item) {
  return {
    uid: item.uid,
    title: item.title,
    url: item.url,
    tags: item.tags ?? [],
    folderUid: item.folderUid,
    folderTitle: item.folderTitle,
  };
}

export function safeDatasource(source) {
  return {
    id: source.id,
    uid: source.uid,
    name: source.name,
    type: source.type,
    access: source.access,
    isDefault: source.isDefault,
    url: source.url,
    secureJsonFields: source.secureJsonFields,
  };
}
