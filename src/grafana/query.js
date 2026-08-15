import {GrafanaError} from './error.js';
import {resolveGrafanaTime} from './time.js';

export function buildQueryPayload(options) {
  const {
    datasourceUid,
    queries,
    from,
    to,
    maxDataPoints = 300,
    intervalMs,
    now = Date.now(),
  } = options;
  const resolvedTo = resolveGrafanaTime(to, now, now);
  const resolvedFrom = resolveGrafanaTime(
    from,
    resolvedTo - 6 * 60 * 60 * 1000,
    now,
  );
  if (resolvedFrom > resolvedTo) {
    throw new GrafanaError('Query start time must not be after its end time.');
  }
  const interval = intervalMs
    || Math.max(1000, Math.floor((resolvedTo - resolvedFrom) / maxDataPoints));

  return {
    from: String(resolvedFrom),
    to: String(resolvedTo),
    queries: queries.map((item, index) => ({
      datasource: {
        type: item.datasourceType || 'prometheus',
        uid: item.datasourceUid || datasourceUid,
      },
      editorMode: 'code',
      expr: item.expr,
      instant: item.instant ?? false,
      legendFormat: item.legendFormat || '',
      range: item.range ?? true,
      refId: item.refId || `Q${index + 1}`,
      exemplar: false,
      interval: '',
      intervalMs: interval,
      maxDataPoints,
      ...(item.queryType ? {queryType: item.queryType} : {}),
      ...(item.maxLines ? {maxLines: item.maxLines} : {}),
    })),
  };
}
