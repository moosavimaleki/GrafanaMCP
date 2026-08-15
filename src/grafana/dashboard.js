import {GrafanaError} from './error.js';

export function panelList(dashboard) {
  const output = [];
  const visit = (panels, rowTitle = undefined) => {
    for (const panel of panels ?? []) {
      output.push({...panel, rowTitle});
      if (panel.type === 'row' && Array.isArray(panel.panels)) {
        visit(panel.panels, panel.title);
      }
    }
  };
  visit(dashboard?.panels);
  return output;
}

function valueFor(variable, override) {
  const current = override ?? variable?.current?.value;
  const value = Array.isArray(current) ? current.join('|') : current;
  if (value === '$__all' || value === 'All') return variable?.allValue || '.*';
  return value === undefined || value === null ? '' : String(value);
}

export function resolveVariables(dashboard, overrides = {}) {
  const values = {};
  for (const variable of dashboard?.templating?.list ?? []) {
    values[variable.name] = valueFor(variable, overrides[variable.name]);
  }
  for (const [name, value] of Object.entries(overrides)) {
    values[name] = Array.isArray(value) ? value.join('|') : String(value);
  }
  return values;
}

export function interpolate(value, variables) {
  if (typeof value !== 'string') return value;
  return value.replace(
    /\$\{([A-Za-z_]\w*)(?::[^}]+)?\}|\$([A-Za-z_]\w*)/g,
    (match, braced, plain) => {
      const name = braced || plain;
      return name.startsWith('__') || !(name in variables) ? match : variables[name];
    },
  );
}

export function jsonPointer(value, pointer) {
  if (pointer === '') return value;
  if (!pointer.startsWith('/')) {
    throw new GrafanaError(
      'json_pointer must be an RFC 6901 pointer, for example /panels/0/title.',
    );
  }
  return pointer.slice(1).split('/').reduce((current, token) => {
    if (current === undefined || current === null) return undefined;
    return current[token.replace(/~1/g, '/').replace(/~0/g, '~')];
  }, value);
}

export function queryTargets(panel, dashboard, overrides) {
  const variables = resolveVariables(dashboard, overrides);
  const panelDatasource = panel.datasource?.uid ?? panel.datasource;
  return (panel.targets ?? [])
    .filter(target => !target.hide && typeof target.expr === 'string' && target.expr.trim())
    .map(target => ({
      refId: target.refId || 'A',
      expr: interpolate(target.expr, variables),
      legendFormat: interpolate(target.legendFormat || '', variables),
      datasourceUid: interpolate(
        target.datasource?.uid ?? target.datasource ?? panelDatasource ?? variables.datasource,
        variables,
      ),
      datasourceType: target.datasource?.type ?? panel.datasource?.type,
      range: target.range !== false,
      instant: target.instant === true,
      queryType: target.queryType,
      maxLines: target.maxLines,
    }));
}
