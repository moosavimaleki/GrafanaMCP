# Grafana MCP

[نسخهٔ فارسی / Persian version](README.md)

A local, read-only MCP server for Grafana dashboards, Prometheus-compatible
metrics such as VictoriaMetrics, and VictoriaLogs. It reaches datasources only
through Grafana; it never connects to Prometheus or VictoriaMetrics directly.

## Features

- List and search dashboards, panels, variables, and panel queries
- Run PromQL and MetricsQL with time ranges and filters
- Discover datasources, metrics, labels, and label values
- Read VictoriaLogs records and LogSQL aggregations
- Read annotations and alert rules, and generate dashboard/panel deeplinks
- Summarize each metric series with latest, minimum, maximum, and average

Every tool is read-only. The server never changes dashboards, alerts,
datasources, or monitoring data.

## Dedicated query tools

For VictoriaMetrics, `query_victoriametrics` runs MetricsQL, while
`list_victoriametrics_namespaces`, `list_victoriametrics_metric_names`,
`list_victoriametrics_label_names`, and `list_victoriametrics_label_values`
provide discovery. For VictoriaLogs, `query_victorialogs` runs LogSQL, and
`list_victorialogs_fields` plus `list_victorialogs_field_values` discover
fields and field values. Obtain the required datasource UID from the datasource
listing tool.

## Requirements and installation

Use Node.js 20 or newer and a Grafana account with read access to the required
dashboards and datasources.

```sh
git clone git@github.com:moosavimaleki/GrafanaMCP.git
cd GrafanaMCP
npm install
npm run check
npm test
```

To run it manually, provide configuration only through the process environment:

```sh
export GRAFANA_BASE_URL='https://grafana.example.com'
export GRAFANA_USERNAME='your-username'
export GRAFANA_PASSWORD='your-password'
export GRAFANA_ORG_ID='1' # optional; defaults to 1
npm start
```

## Install in Codex

Add this local MCP server to `~/.codex/config.toml`. Replace the path and
placeholder values locally; do not commit this configuration file.

```toml
[mcp_servers.grafana]
command = "node"
args = ["/absolute/path/to/GrafanaMCP/src/index.js"]

[mcp_servers.grafana.env]
GRAFANA_BASE_URL = "https://grafana.example.com"
GRAFANA_ORG_ID = "1"
GRAFANA_USERNAME = "your-username"
GRAFANA_PASSWORD = "your-password"
```

Restart Codex, then check the connection with `codex mcp list`. See the safe,
placeholder-only [mcp.json.example](mcp.json.example) as a configuration
template.

## Install in Claude Code

Install the server in user scope. Substitute real values only in your local
terminal or secret store; do not put a real password in shared shell history.

```sh
claude mcp add grafana --scope user \
  --env GRAFANA_BASE_URL='https://grafana.example.com' \
  --env GRAFANA_ORG_ID='1' \
  --env GRAFANA_USERNAME='your-username' \
  --env GRAFANA_PASSWORD='your-password' \
  -- node /absolute/path/to/GrafanaMCP/src/index.js
```

Verify it with `claude mcp list`. A project-level `.mcp.json` can reference
`${VARIABLE}` values from the environment, but it must not contain secrets and
is intentionally ignored by this repository.

## Query references

Use [MetricsQL][metricsql] for VictoriaMetrics-specific metric syntax and
[LogSQL][logsql] for VictoriaLogs queries. Relevant tool responses also include
these links.

[metricsql]: https://docs.victoriametrics.com/victoriametrics/metricsql/
[logsql]: https://docs.victoriametrics.com/victorialogs/logsql/
