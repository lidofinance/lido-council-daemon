import http = require('node:http');
import https = require('node:https');

export function configureHttpAgents(): void {
  // ethers v5 uses the global agents and does not retry a stale socket reset.
  // Keep the existing agents so Node's proxy and TLS settings stay in place.
  // Set the runtime flag before creating providers or making any requests.
  Object.assign(http.globalAgent, { keepAlive: false });
  Object.assign(https.globalAgent, { keepAlive: false });
}
