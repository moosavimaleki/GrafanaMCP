import {ProxyAgent} from 'undici';

import {GrafanaError} from './error.js';

const dispatcherPromises = new Map();
const autoRoutes = new Map();

export function proxySettings(env = process.env) {
  const mode = (env.GRAFANA_PROXY_MODE || 'direct').toLowerCase();
  if (!['auto', 'always', 'direct'].includes(mode)) {
    throw new GrafanaError('GRAFANA_PROXY_MODE must be auto, always, or direct.');
  }
  if (mode === 'direct') return {mode};

  const uri = env.GRAFANA_PROXY_URL;
  if (!uri) {
    throw new GrafanaError('Set GRAFANA_PROXY_URL when GRAFANA_PROXY_MODE is auto or always.');
  }
  let url;
  try {
    url = new URL(uri);
  } catch {
    throw new GrafanaError('GRAFANA_PROXY_URL must be a valid HTTP or HTTPS proxy URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new GrafanaError('GRAFANA_PROXY_URL must be a valid HTTP or HTTPS proxy URL.');
  }
  return {mode, uri: url.toString()};
}

export function proxyDispatcher(
  settings,
  {createAgent = uri => new ProxyAgent({uri, proxyTunnel: false})} = {},
) {
  if (settings.mode === 'direct') return undefined;
  return createAgent(settings.uri);
}

export function configuredProxyDispatcher(settings) {
  const key = settings.mode === 'direct' ? 'direct' : `${settings.mode}|${settings.uri}`;
  if (!dispatcherPromises.has(key)) {
    dispatcherPromises.set(key, proxyDispatcher(settings));
  }
  return dispatcherPromises.get(key);
}

export function configuredAutoRoute(baseUrl, settings) {
  const key = `${baseUrl}|${settings.uri}`;
  if (!autoRoutes.has(key)) {
    autoRoutes.set(key, {route: undefined, lastDirectProbeAt: 0, pending: undefined});
  }
  return autoRoutes.get(key);
}
