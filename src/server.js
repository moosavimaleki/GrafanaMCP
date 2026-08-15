import {McpServer} from '@modelcontextprotocol/server';

import {registerCoreTools} from './mcp/core-tools.js';
import {registerDashboardTools} from './mcp/dashboard-tools.js';
import {registerLogTools} from './mcp/log-tools.js';
import {registerMetaTools} from './mcp/meta-tools.js';
import {registerMetricDiscoveryTools} from './mcp/metric-discovery-tools.js';
import {registerMetricQueryTools} from './mcp/metric-query-tools.js';
import {registerMonitorTool} from './mcp/monitor-tool.js';

export function makeServer() {
  const server = new McpServer(
    {name: 'grafana-mcp', version: '0.1.0'},
    {
      instructions: [
        'Use these tools only for read-only Grafana discovery and monitoring.',
        'Authentication uses an in-memory username/password session.',
        'A 401 triggers one login and one retry; Chrome cookies and token rotation are not used.',
      ].join(' '),
    },
  );
  registerCoreTools(server);
  registerDashboardTools(server);
  registerMetricDiscoveryTools(server);
  registerMetricQueryTools(server);
  registerLogTools(server);
  registerMonitorTool(server);
  registerMetaTools(server);
  return server;
}
