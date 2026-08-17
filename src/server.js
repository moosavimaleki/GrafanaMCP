import {McpServer} from '@modelcontextprotocol/server';

import {registerCoreTools} from './mcp/core-tools.js';
import {registerDashboardTools} from './mcp/dashboard-tools.js';
import {registerHelpTool} from './mcp/help-tool.js';
import {registerLogTools} from './mcp/log-tools.js';
import {registerMetaTools} from './mcp/meta-tools.js';
import {registerMetricDiscoveryTools} from './mcp/metric-discovery-tools.js';
import {registerMetricQueryTools} from './mcp/metric-query-tools.js';
import {registerMonitorTool} from './mcp/monitor-tool.js';
import {registerVictoriaMetricsTools} from './mcp/victoriametrics-tools.js';

export function makeServer() {
  const server = new McpServer(
    {name: 'grafana-mcp', version: '0.1.0'},
    {
      instructions: [
        'Use these tools only for read-only Grafana discovery and monitoring.',
        'Authentication uses an in-memory username/password session.',
        'Sessions rotate before expiry; a 401 triggers one login and one retry.',
        'Tool responses use compact TOON text and omit repeated request data and documentation.',
        'Call grafana_help only when workflow, query syntax, or output guidance is needed.',
      ].join(' '),
    },
  );
  registerHelpTool(server);
  registerCoreTools(server);
  registerDashboardTools(server);
  registerMetricDiscoveryTools(server);
  registerMetricQueryTools(server);
  registerVictoriaMetricsTools(server);
  registerLogTools(server);
  registerMonitorTool(server);
  registerMetaTools(server);
  return server;
}
