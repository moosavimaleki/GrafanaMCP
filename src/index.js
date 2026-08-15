import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {makeServer} from './server.js';

console.error('grafana-mcp is running on stdio');
void serveStdio(makeServer);
