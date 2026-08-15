# Grafana MCP (session login)

Local, read-only MCP server for Grafana dashboards and Prometheus-compatible datasources such as VictoriaMetrics.

## Authentication

Set `GRAFANA_BASE_URL`, `GRAFANA_USERNAME`, and `GRAFANA_PASSWORD` in the MCP client environment. The password is used only for `POST /login`, is never returned by a tool, and stays in process memory only. The server retains only Grafana's HttpOnly session cookies in memory.

The server adopts new `Set-Cookie` values from every Grafana response. When Grafana returns `401`, it discards the failed in-memory session, logs in once, and retries the original request once. Concurrent failures share one login. It never calls `/api/user/auth-tokens/rotate`, never reads Chrome cookies, and never writes a cookie jar to disk.

Use [mcp.json.example](mcp.json.example) as the MCP client configuration template. Keep real credentials in your client's secret/environment configuration, not in this repository.

## Read-only tools

- Dashboard discovery, summaries, JSON Pointer property extraction, panels, panel PromQL, and dashboard-wide monitoring queries
- Datasource listing/details and Prometheus/VictoriaMetrics metric, label, and label-value discovery
- PromQL queries through Grafana's datasource proxy, with per-series latest/min/max/average summaries, time ranges, and dashboard-variable overrides
- VictoriaLogs LogSQL queries, returned log lines, and field/field-value discovery for log filters
- Alert rules, annotations, and dashboard/panel deeplinks

All datasource queries go through Grafana. The MCP server never contacts Prometheus or VictoriaMetrics directly.

Every VictoriaLogs response includes the [LogsQL reference](https://docs.victoriametrics.com/victorialogs/logsql/), and every metrics response includes the [MetricsQL reference](https://docs.victoriametrics.com/victoriametrics/metricsql/). MetricsQL is PromQL-compatible but adds VictoriaMetrics-specific functions and behavior; use that reference when composing queries.

## Run

```sh
npm install
npm run check
npm start
```
