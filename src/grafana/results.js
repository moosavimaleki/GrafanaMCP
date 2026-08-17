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
    points: values.length,
    first: samples[0].value,
    firstTime: samples[0].time ?? null,
    latest: samples.at(-1).value,
    latestTime: samples.at(-1).time ?? null,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: total / values.length,
  };
}

function quotedLabel(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');
}

function redundantLabelName(item) {
  const labels = Object.entries(item.labels);
  if (labels.length === 0) return false;
  const fields = labels.map(([name, value]) => `${name}="${quotedLabel(value)}"`);
  return item.name === `{${fields.join(',')}}` || item.name === `{${fields.join(', ')}}`;
}

function compactSeries(series, includeStats) {
  const omitName = series.length > 0 && series.every(redundantLabelName);
  if (includeStats) {
    return {series: omitName ? series.map(({name, ...item}) => item) : series};
  }
  const instant = series.every(item => item.points === 1);
  const sharedTime = series.length > 0
    && series.every(item => item.latestTime === series[0].latestTime);
  return {
    ...(sharedTime ? {time: series[0].latestTime} : {}),
    series: series.map(item => ({
      ...(omitName ? {} : {name: item.name}),
      labels: item.labels,
      value: item.latest,
      ...(sharedTime ? {} : {time: item.latestTime}),
      ...(instant ? {} : {points: item.points}),
    })),
  };
}

export function summarizeQueryResult(response, maxSeries = 100, {includeStats = false} = {}) {
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
        points += summary.points;
        seriesCount += 1;
        if (series.length < maxSeries) series.push(summary);
      });
    }

    const summary = compactSeries(series, includeStats);
    if (result.status && result.status !== 200) summary.status = result.status;
    if (result.error) summary.error = result.error;
    if (seriesCount > series.length) {
      summary.totalSeries = seriesCount;
      summary.returnedSeries = series.length;
      summary.truncated = true;
    }
    if (series.length === 0 && frames.length > 0) {
      summary.frames = frames.length;
      summary.numericPoints = points;
    }
    results[refId] = summary;
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
