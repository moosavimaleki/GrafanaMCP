# Token-efficient Grafana MCP query output

## Decision

Use a single MCP `TextContent` encoded with the official TOON implementation.
Do not also return the same payload as `structuredContent`. Shape metric data
before encoding: compact mode returns the latest value per series; stats mode
adds range statistics. Keep query help and documentation in the on-demand
`grafana_help` tool.

## Why

- MCP permits text-only tool results; `structuredContent` is optional. Returning
  both forms can duplicate the same context: [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
- Grafana DataFrames are column-oriented, so repeated series and log rows are a
  natural fit for a schema-once tabular representation: [Grafana DataFrames](https://grafana.com/developers/plugin-tools/key-concepts/data-frames).
- TOON encodes uniform arrays with one field header and row values, while still
  supporting nested JSON-shaped data: [TOON specification](https://github.com/toon-format/spec/blob/main/SPEC.md).
- CSV/TSV can be smaller for purely flat tables, but it does not preserve nested
  labels and mixed tool results as cleanly. The TOON project recommends choosing
  by data shape: [TOON format guidance](https://github.com/toon-format/toon#when-not-to-use-toon).
- Independent agentic benchmarks warn that a compact format does not guarantee
  equal accuracy on every model. The response shape therefore removes semantic
  duplication first and uses the official encoder instead of a custom grammar:
  [Notation Matters](https://arxiv.org/abs/2605.29676).

## Applied response policy

- No request echo in metric or log query results.
- No MetricsQL or LogSQL URL in ordinary results.
- Instant result: `name`, `labels`, `value`, `time`.
- A display name that only restates the label set is omitted.
- A timestamp shared by all compact series is emitted once above the table.
- Compact range result: the same fields plus `points`.
- `detail=stats`: first/latest values and times, minimum, maximum, average.
- `max_series`: explicit cardinality bound; truncation metadata is retained.
- Logs and discovery arrays use TOON's schema-once tabular encoding.
