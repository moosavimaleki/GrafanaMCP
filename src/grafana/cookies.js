function setCookieValues(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  return headers.get('set-cookie')?.split(/,(?=\s*[^;,\s]+=)/) ?? [];
}

function cookieUpdates(headers) {
  const updates = new Map();
  for (const value of setCookieValues(headers)) {
    const [pair, ...attributes] = value.split(';');
    const separator = pair.indexOf('=');
    if (separator < 1) continue;

    const name = pair.slice(0, separator).trim();
    if (name !== 'grafana_session' && name !== 'grafana_session_expiry') continue;

    const maxAge = attributes.find(attribute =>
      attribute.trim().toLowerCase().startsWith('max-age='),
    );
    const deleted = maxAge?.trim().toLowerCase() === 'max-age=0';
    updates.set(name, deleted ? undefined : pair.slice(separator + 1).trim());
  }
  return updates;
}

function parseCookieHeader(cookie) {
  const pairs = new Map();
  for (const part of cookie?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    pairs.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return pairs;
}

export function mergeSessionCookie(current, headers, replace = false) {
  const updates = cookieUpdates(headers);
  if (updates.size === 0) return current;

  const pairs = replace ? new Map() : parseCookieHeader(current);
  for (const [name, value] of updates) {
    if (value === undefined) pairs.delete(name);
    else pairs.set(name, value);
  }
  if (!pairs.has('grafana_session')) return undefined;
  return [...pairs].map(([name, value]) => `${name}=${value}`).join('; ');
}
