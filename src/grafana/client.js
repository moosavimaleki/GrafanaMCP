import {mergeSessionCookie, sessionExpirySeconds} from './cookies.js';
import {GrafanaError} from './error.js';
import {configuredAutoRoute, configuredProxyDispatcher, proxySettings} from './proxy.js';
import {failureDetail, responsePayload} from './response.js';

const sessions = new Map();
const pendingLogins = new Map();
const pendingRotations = new Map();
const rotateWindowSeconds = 5 * 60;
const directProbeTimeoutMs = 3000;
const proxyProbeTimeoutMs = 12000;
const directRecheckMs = 5 * 60 * 1000;

function normalizeBaseUrl(baseUrl) {
  const value = (baseUrl || process.env.GRAFANA_BASE_URL || '').replace(/\/$/, '');
  if (!value) throw new GrafanaError('Provide base_url or set GRAFANA_BASE_URL.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new GrafanaError('Grafana base_url must use HTTP or HTTPS.');
  }
  return value;
}

export class GrafanaClient {
  constructor({baseUrl, orgId, proxyConfig} = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.orgId = String(orgId || process.env.GRAFANA_ORG_ID || '1');
    this.sessionKey = `${this.baseUrl}|${this.orgId}`;
    this.proxySettings = proxyConfig || proxySettings();
    this.proxyDispatcher = configuredProxyDispatcher(this.proxySettings);
    this.autoRouteState = this.proxySettings.mode === 'auto'
      ? configuredAutoRoute(this.baseUrl, this.proxySettings)
      : undefined;
  }

  get autoRoute() {
    return this.autoRouteState?.route;
  }

  async fetchVia(route, url, options) {
    if (route === 'direct') return fetch(url, options);
    const dispatcher = await this.proxyDispatcher;
    return fetch(url, {...options, dispatcher});
  }

  async probe(route) {
    const response = await this.fetchVia(route, new URL('/api/health', this.baseUrl), {
      signal: AbortSignal.timeout(route === 'direct' ? directProbeTimeoutMs : proxyProbeTimeoutMs),
    });
    await response.body?.cancel();
  }

  async selectAutoRoute() {
    const state = this.autoRouteState;
    if (state.route === 'direct') return 'direct';
    if (state.route === 'proxy' && Date.now() - state.lastDirectProbeAt < directRecheckMs) {
      return 'proxy';
    }
    if (state.pending) return state.pending;

    state.pending = (async () => {
      state.lastDirectProbeAt = Date.now();
      try {
        await this.probe('direct');
        state.route = 'direct';
      } catch {
        if (state.route !== 'proxy') {
          await this.probe('proxy');
          state.route = 'proxy';
        }
      }
      return state.route;
    })().finally(() => { state.pending = undefined; });
    return state.pending;
  }

  async fetch(url, options = {}) {
    if (this.proxySettings.mode === 'direct') return this.fetchVia('direct', url, options);
    if (this.proxySettings.mode === 'always') return this.fetchVia('proxy', url, options);

    const route = await this.selectAutoRoute();
    try {
      return await this.fetchVia(route, url, options);
    } catch (error) {
      if (options.signal?.aborted || !(error instanceof TypeError && error.message === 'fetch failed')) {
        throw error;
      }
      const alternate = route === 'direct' ? 'proxy' : 'direct';
      try {
        const response = await this.fetchVia(alternate, url, options);
        this.autoRouteState.route = alternate;
        this.autoRouteState.lastDirectProbeAt = Date.now();
        return response;
      } catch (alternateError) {
        if (this.autoRouteState.route === route) this.autoRouteState.route = undefined;
        throw alternateError;
      }
    }
  }

  updateSession(headers, replace = false) {
    const cookie = mergeSessionCookie(sessions.get(this.sessionKey), headers, replace);
    if (cookie) sessions.set(this.sessionKey, cookie);
    else sessions.delete(this.sessionKey);
  }

  async performLogin() {
    const user = process.env.GRAFANA_USERNAME;
    const password = process.env.GRAFANA_PASSWORD;
    if (!user || !password) {
      throw new GrafanaError(
        'Set GRAFANA_USERNAME and GRAFANA_PASSWORD; Chrome DevTools is not used.',
      );
    }
    const response = await this.fetch(new URL('/login', this.baseUrl), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Grafana-Org-Id': this.orgId,
      },
      body: JSON.stringify({user, password}),
    });
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new GrafanaError(
        `Grafana login failed (${response.status})${failureDetail(payload)}`,
        response.status,
      );
    }
    this.updateSession(response.headers, true);
    if (!sessions.has(this.sessionKey)) {
      throw new GrafanaError('Grafana login succeeded without a grafana_session cookie.');
    }
  }

  async login() {
    const existing = pendingLogins.get(this.sessionKey);
    if (existing) return existing;
    const login = this.performLogin().finally(() => pendingLogins.delete(this.sessionKey));
    pendingLogins.set(this.sessionKey, login);
    return login;
  }

  sessionExpiresSoon() {
    const expiry = sessionExpirySeconds(sessions.get(this.sessionKey));
    return expiry !== undefined
      && expiry - Math.floor(Date.now() / 1000) <= rotateWindowSeconds;
  }

  async performRotation() {
    const attemptedCookie = sessions.get(this.sessionKey);
    const response = await this.requestOnce('/api/user/auth-tokens/rotate', {method: 'POST'});
    await response.arrayBuffer();
    this.updateSession(response.headers);

    if (response.status !== 401) return;
    if (sessions.get(this.sessionKey) === attemptedCookie) sessions.delete(this.sessionKey);
    if (!sessions.has(this.sessionKey)) await this.login();
  }

  async rotate() {
    const existing = pendingRotations.get(this.sessionKey);
    if (existing) return existing;
    const rotation = this.performRotation().finally(() => pendingRotations.delete(this.sessionKey));
    pendingRotations.set(this.sessionKey, rotation);
    return rotation;
  }

  async ensureSession() {
    if (!sessions.has(this.sessionKey)) await this.login();
    else if (this.sessionExpiresSoon()) await this.rotate();
  }

  async requestOnce(pathname, options = {}) {
    const {method = 'GET', body, rawBody, headers = {}} = options;
    const cookie = sessions.get(this.sessionKey);
    return this.fetch(new URL(pathname, this.baseUrl), {
      method,
      headers: {
        Accept: 'application/json',
        'X-Grafana-Org-Id': this.orgId,
        ...(cookie ? {Cookie: cookie} : {}),
        ...headers,
      },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  }

  async request(pathname, options = {}) {
    await this.ensureSession();
    const attemptedCookie = sessions.get(this.sessionKey);
    let response = await this.requestOnce(pathname, options);
    this.updateSession(response.headers);

    if (response.status === 401) {
      await response.arrayBuffer();
      if (sessions.get(this.sessionKey) === attemptedCookie) sessions.delete(this.sessionKey);
      if (!sessions.has(this.sessionKey)) await this.login();
      response = await this.requestOnce(pathname, options);
      this.updateSession(response.headers);
    }

    const payload = await responsePayload(response);
    if (response.status === 401) {
      throw new GrafanaError(
        'Grafana returned 401 after one automatic login. Check the configured credentials.',
        401,
      );
    }
    if (!response.ok) {
      throw new GrafanaError(
        `Grafana request failed (${response.status})${failureDetail(payload)}`,
        response.status,
      );
    }
    return payload;
  }
}
