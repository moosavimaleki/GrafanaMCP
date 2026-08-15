import {mergeSessionCookie, sessionExpirySeconds} from './cookies.js';
import {GrafanaError} from './error.js';

const sessions = new Map();
const pendingLogins = new Map();
const pendingRotations = new Map();
const rotateWindowSeconds = 5 * 60;

function normalizeBaseUrl(baseUrl) {
  const value = (baseUrl || process.env.GRAFANA_BASE_URL || '').replace(/\/$/, '');
  if (!value) throw new GrafanaError('Provide base_url or set GRAFANA_BASE_URL.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new GrafanaError('Grafana base_url must use HTTP or HTTPS.');
  }
  return value;
}

async function responsePayload(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

export class GrafanaClient {
  constructor({baseUrl, orgId}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.orgId = String(orgId || process.env.GRAFANA_ORG_ID || '1');
    this.sessionKey = `${this.baseUrl}|${this.orgId}`;
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
    const response = await fetch(new URL('/login', this.baseUrl), {
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
      const detail = typeof payload === 'object' && payload?.message
        ? `: ${payload.message}`
        : '';
      throw new GrafanaError(`Grafana login failed (${response.status})${detail}`, response.status);
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

  requestOnce(pathname, options = {}) {
    const {method = 'GET', body, rawBody, headers = {}} = options;
    const cookie = sessions.get(this.sessionKey);
    return fetch(new URL(pathname, this.baseUrl), {
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
      const detail = typeof payload === 'object' && payload?.message
        ? `: ${payload.message}`
        : '';
      throw new GrafanaError(`Grafana request failed (${response.status})${detail}`, response.status);
    }
    return payload;
  }
}
