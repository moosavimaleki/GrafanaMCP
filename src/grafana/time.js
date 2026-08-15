import {GrafanaError} from './error.js';

const TIME_UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function resolveGrafanaTime(value, fallback, now = Date.now()) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number' || /^\d+$/.test(value)) {
    const epoch = Number(value);
    if (Number.isSafeInteger(epoch) && epoch >= 0) return epoch;
  }

  const relative = String(value).match(
    /^now(?:([+-])(\d+)(ms|s|m|h|d|w))?$/,
  );
  if (relative) {
    if (!relative[1]) return now;
    const delta = Number(relative[2]) * TIME_UNITS[relative[3]];
    return relative[1] === '-' ? now - delta : now + delta;
  }

  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) return parsed;
  throw new GrafanaError(
    `Unsupported time value: ${value}. Use epoch milliseconds, ISO 8601, now, or now-30m.`,
  );
}
