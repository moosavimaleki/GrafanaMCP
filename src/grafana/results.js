function seriesSummary(field, series, timestamps) {
  const samples = [];
  series.forEach((value, index) => {
    if (Number.isFinite(value)) samples.push({value, time: timestamps?.[index]});
  });
  if (samples.length === 0) return undefined;
  const values = samples.map(sample => sample.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    name: field.config?.displayNameFromDS || field.name,
    labels: field.labels ?? {},
    pointCount: values.length,
    first: samples[0],
    latest: samples.at(-1),
    min: Math.min(...values),
    max: Math.max(...values),
    average: total / values.length,
  };
}

export function summarizeQueryResult(response, maxSeries = 100) {
  const results = {};
  for (const [refId, result] of Object.entries(response?.results ?? {})) {
    const frames = result.frames ?? [];
    let points = 0;
    let seriesCount = 0;
    const series = [];

    for (const frame of frames) {
      const fields = frame.schema?.fields ?? [];
      const values = frame.data?.values ?? [];
      const timeIndex = fields.findIndex(field => field.type === 'time');
      const timestamps = timeIndex >= 0 ? values[timeIndex] : undefined;
      fields.forEach((field, index) => {
        if (field.type !== 'number') return;
        const summary = seriesSummary(field, values[index] ?? [], timestamps);
        if (!summary) return;
        points += summary.pointCount;
        seriesCount += 1;
        if (series.length < maxSeries) series.push(summary);
      });
    }

    const firstSeries = series[0];
    results[refId] = {
      status: result.status ?? 200,
      error: result.error ?? undefined,
      frameCount: frames.length,
      numericPointCount: points,
      seriesCount,
      returnedSeriesCount: series.length,
      seriesTruncated: seriesCount > series.length,
      latest: firstSeries
        ? {
          ...firstSeries.latest,
          name: firstSeries.name,
          labels: firstSeries.labels,
        }
        : undefined,
      series,
    };
  }
  return results;
}

export function rowsFromFrames(response, limit = 100, includedRefIds = undefined) {
  const rows = [];
  for (const [refId, result] of Object.entries(response?.results ?? {})) {
    if (includedRefIds && !includedRefIds.has(refId)) continue;
    for (const frame of result.frames ?? []) {
      const fields = frame.schema?.fields ?? [];
      const columns = frame.data?.values ?? [];
      const length = Math.max(0, ...columns.map(column => column?.length ?? 0));
      for (let rowIndex = 0; rowIndex < length && rows.length < limit; rowIndex += 1) {
        const row = {refId};
        fields.forEach((field, columnIndex) => {
          row[field.name] = columns[columnIndex]?.[rowIndex];
        });
        rows.push(row);
      }
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}
