import {GrafanaError} from './error.js';

export const health = client => client.request('/api/health');
export const datasources = client => client.request('/api/datasources');

export function dashboards(client, {query, tag, folderUid, limit = 100, page = 1} = {}) {
  const params = new URLSearchParams({type: 'dash-db', limit: String(limit), page: String(page)});
  if (query) params.set('query', query);
  if (tag) params.set('tag', tag);
  if (folderUid) params.set('folderUIDs', folderUid);
  return client.request(`/api/search?${params}`);
}

export async function dashboard(client, uid) {
  const encoded = encodeURIComponent(uid);
  try {
    const raw = await client.request(
      `/apis/dashboard.grafana.app/v1beta1/namespaces/default/dashboards/${encoded}/dto`,
    );
    return {format: 'dto', raw, dashboard: raw.spec};
  } catch (error) {
    if (!(error instanceof GrafanaError) || error.status !== 404) throw error;
    const raw = await client.request(`/api/dashboards/uid/${encoded}`);
    return {format: 'legacy', raw, dashboard: raw.dashboard};
  }
}

export function datasource(client, uid) {
  return client.request(`/api/datasources/uid/${encodeURIComponent(uid)}`);
}

export function datasourceResource(client, uid, resourcePath, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) value.forEach(item => query.append(key, String(item)));
    else query.set(key, String(value));
  }
  const suffix = query.size ? `?${query}` : '';
  return client.request(
    `/api/datasources/uid/${encodeURIComponent(uid)}/resources/${resourcePath}${suffix}`,
  );
}

export async function datasourceProxyForm(client, uid, path, fields) {
  const source = await datasource(client, uid);
  if (!source.id) {
    throw new GrafanaError(`Datasource ${uid} has no numeric ID for its proxy API.`);
  }
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') form.set(key, String(value));
  }
  return client.request(`/api/datasources/proxy/${encodeURIComponent(source.id)}/${path}`, {
    method: 'POST',
    rawBody: form.toString(),
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  });
}

export function alertRules(client, dashboardUid) {
  const suffix = dashboardUid ? `?dashboard_uid=${encodeURIComponent(dashboardUid)}` : '';
  return client.request(`/api/prometheus/grafana/api/v1/rules${suffix}`);
}

export function annotations(client, options = {}) {
  const {from, to, dashboardUid, tags, matchAny = false, limit = 100} = options;
  const params = new URLSearchParams({
    from: String(from),
    to: String(to),
    limit: String(limit),
    matchAny: String(matchAny),
  });
  if (dashboardUid) params.set('dashboardUID', dashboardUid);
  for (const tag of tags ?? []) params.append('tags', tag);
  return client.request(`/api/annotations?${params}`);
}

export function query(client, payload) {
  return client.request('/api/ds/query', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: payload,
  });
}
