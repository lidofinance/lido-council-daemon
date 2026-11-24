import { ExtendedJsonRpcBatchProvider } from '@lido-nestjs/execution';
import http = require('node:http');
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { USER_AGENT } from 'app.constants';
import { withUserAgent } from './user-agent';

describe('withUserAgent', () => {
  it('adds the header and keeps every URL', () => {
    expect(
      withUserAgent(['https://a.example.com', 'https://b.example.com']),
    ).toEqual([
      { url: 'https://a.example.com', headers: { 'User-Agent': USER_AGENT } },
      { url: 'https://b.example.com', headers: { 'User-Agent': USER_AGENT } },
    ]);
  });

  it('sends the header on an RPC request and keeps the host as the domain', async () => {
    let userAgent: string | undefined;
    const server = http.createServer((request, response) => {
      userAgent = request.headers['user-agent'];
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        const payload = JSON.parse(body);
        const answer = (call: { id: number }) => ({
          jsonrpc: '2.0',
          id: call.id,
          result: '0x10',
        });
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify(
            Array.isArray(payload) ? payload.map(answer) : answer(payload),
          ),
        );
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;

    try {
      const url = `http://127.0.0.1:${port}`;
      const [connection] = withUserAgent([url]);
      const provider = new ExtendedJsonRpcBatchProvider(connection, 1);

      expect(await provider.send('eth_blockNumber', [])).toBe('0x10');
      expect(userAgent).toBe(USER_AGENT);
      expect(provider.domain).toBe('127.0.0.1');
      expect(provider.domain).toBe(
        new ExtendedJsonRpcBatchProvider(url, 1).domain,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
