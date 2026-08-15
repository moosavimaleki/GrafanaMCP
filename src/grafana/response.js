export async function responsePayload(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

function datasourceFailure(payload) {
  if (!payload || typeof payload !== 'object') return undefined;
  return Object.values(payload.results ?? {}).find(result => (
    result && typeof result.error === 'string'
  ));
}

export function failureDetail(payload) {
  if (payload && typeof payload === 'object' && typeof payload.message === 'string') {
    return `: ${payload.message}`;
  }
  const failure = datasourceFailure(payload);
  if (!failure) return '';
  if (/dial tcp|lookup|no such host|connection refused|network is unreachable|timeout/i.test(failure.error)) {
    return ': datasource backend cannot be reached (DNS or network failure).';
  }
  const status = Number.isInteger(failure.status) ? ` (${failure.status})` : '';
  return `: datasource query failed${status}.`;
}
