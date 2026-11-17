import http = require('node:http');
import https = require('node:https');
import { once } from 'node:events';
import { AddressInfo, connect, Socket } from 'node:net';
import { Duplex } from 'node:stream';
import { DEFAULT_ECDH_CURVE } from 'node:tls';
import { utils } from 'ethers';
import { ExtendedJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { configureHttpAgents } from './http-agents';
import {
  testServerCertificate,
  testServerKey,
} from '../../test/fixtures/http-tls';

const clients = [
  {
    name: 'ethers',
    create: (url: string) => async () => {
      const response = await utils.fetchJson(
        { url, timeout: 1000 },
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
      );
      return response.result;
    },
  },
  {
    name: 'execution batch provider used by both RPC modules',
    create: (url: string) => {
      const provider = new ExtendedJsonRpcBatchProvider(
        { url, timeout: 1000 },
        { name: 'local', chainId: 31337 },
      );
      return () => provider.send('eth_blockNumber', []);
    },
  },
];

describe('HTTP agents', () => {
  let previousHttpAgent: http.Agent;
  let previousHttpsAgent: https.Agent;
  let server: http.Server;
  let secureServer: https.Server | undefined;
  let rpcRequestListener: http.RequestListener;
  let extraSockets: Set<Duplex>;
  let url: string;
  let requests: number;
  let requestPaths: (string | undefined)[];
  let requestsPerSocket: Map<Socket, number>;

  beforeEach(async () => {
    previousHttpAgent = http.globalAgent;
    previousHttpsAgent = https.globalAgent;
    http.globalAgent = new http.Agent({ keepAlive: true, timeout: 5000 });
    https.globalAgent = new https.Agent({ keepAlive: true, timeout: 5000 });
    requests = 0;
    requestPaths = [];
    requestsPerSocket = new Map();
    secureServer = undefined;
    extraSockets = new Set();
    rpcRequestListener = (request, response) => {
      requests += 1;
      requestPaths.push(request.url);
      const socketRequests = (requestsPerSocket.get(request.socket) ?? 0) + 1;
      requestsPerSocket.set(request.socket, socketRequests);
      if (socketRequests > 1) {
        // Model a proxy closing a stale connection as its next request arrives.
        request.socket.destroy();
        return;
      }

      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        const payload = JSON.parse(body);
        const reply = ({ id }: { id: number }) => ({
          jsonrpc: '2.0',
          id,
          result: '0x2a',
        });
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify(
            Array.isArray(payload) ? payload.map(reply) : reply(payload),
          ),
        );
      });
    };
    server = http.createServer(rpcRequestListener);
    const listening = once(server, 'listening');
    server.listen(0, '127.0.0.1');
    await listening;
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (http.globalAgent !== previousHttpAgent) http.globalAgent.destroy();
    if (https.globalAgent !== previousHttpsAgent) https.globalAgent.destroy();
    http.globalAgent = previousHttpAgent;
    https.globalAgent = previousHttpsAgent;
    for (const socket of requestsPerSocket.keys()) socket.destroy();
    for (const socket of extraSockets) socket.destroy();
    await Promise.all(
      [server, secureServer].map(
        (current) =>
          new Promise<void>((resolve, reject) => {
            if (!current?.listening) return resolve();
            current.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  async function listenTlsServer() {
    secureServer = https.createServer(
      { key: testServerKey, cert: testServerCertificate },
      rpcRequestListener,
    );
    secureServer.on('connection', (socket) => {
      extraSockets.add(socket);
      socket.on('close', () => extraSockets.delete(socket));
    });
    const listening = once(secureServer, 'listening');
    secureServer.listen(0, '127.0.0.1');
    await listening;
    const port = (secureServer.address() as AddressInfo).port;
    return { port, url: `https://127.0.0.1:${port}` };
  }

  it.each(clients)(
    'exposes a stale socket reset with $name',
    async ({ create }) => {
      const request = create(url);

      await expect(request()).resolves.toBe('0x2a');
      await expect(request()).rejects.toMatchObject({ code: 'SERVER_ERROR' });
      expect(requests).toBe(2);
      expect(requestsPerSocket.size).toBe(1);
    },
  );

  it.each(clients)('uses fresh sockets with $name', async ({ create }) => {
    configureHttpAgents();
    const request = create(url);

    for (let index = 0; index < 4; index += 1) {
      await expect(request()).resolves.toBe('0x2a');
    }
    expect(requests).toBe(4);
    expect(requestsPerSocket.size).toBe(4);
    expect([...requestsPerSocket.values()]).toEqual([1, 1, 1, 1]);
  });

  it.each(clients)(
    'uses fresh HTTPS sockets with $name and a verified certificate',
    async ({ create }) => {
      const endpoint = await listenTlsServer();
      https.globalAgent.destroy();
      const agent = new https.Agent({
        keepAlive: true,
        ca: testServerCertificate,
        rejectUnauthorized: true,
      });
      https.globalAgent = agent;
      const options = agent.options;
      configureHttpAgents();
      const request = create(endpoint.url);

      for (let index = 0; index < 4; index += 1) {
        await expect(request()).resolves.toBe('0x2a');
      }
      expect(https.globalAgent).toBe(agent);
      expect(agent.options).toBe(options);
      expect(agent.options.ca).toBe(testServerCertificate);
      expect(agent.options.rejectUnauthorized).toBe(true);
      expect(requests).toBe(4);
      expect(requestsPerSocket.size).toBe(4);
      expect([...requestsPerSocket.values()]).toEqual([1, 1, 1, 1]);
    },
  );

  it('rejects an HTTPS certificate outside the configured trust store', async () => {
    const endpoint = await listenTlsServer();
    configureHttpAgents();

    await expect(clients[0].create(endpoint.url)()).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      serverError: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' },
    });
    expect(requests).toBe(0);
  });

  it('preserves both agent instances and their configured options', () => {
    const proxyEnv = {
      HTTP_PROXY: url,
      HTTPS_PROXY: url,
      NO_PROXY: '*',
    };
    const httpOptions = { keepAlive: true, timeout: 5000, proxyEnv };
    const httpsOptions = { ...httpOptions, rejectUnauthorized: true };
    http.globalAgent.destroy();
    https.globalAgent.destroy();
    const httpAgent = new http.Agent(httpOptions);
    const httpsAgent = new https.Agent(httpsOptions);
    http.globalAgent = httpAgent;
    https.globalAgent = httpsAgent;
    const savedHttpsOptions = httpsAgent.options;

    configureHttpAgents();

    expect(http.globalAgent).toBe(httpAgent);
    expect(https.globalAgent).toBe(httpsAgent);
    expect(httpAgent).toMatchObject({ keepAlive: false, options: httpOptions });
    expect(httpsAgent).toMatchObject({
      keepAlive: false,
      options: httpsOptions,
    });
    expect(httpsAgent.options).toBe(savedHttpsOptions);
    expect(httpsAgent.options.proxyEnv).toBe(proxyEnv);
  });

  it('keeps HTTP proxy routing while using a fresh socket per request', async () => {
    http.globalAgent.destroy();
    const proxyAgent = new http.Agent({
      keepAlive: true,
      proxyEnv: { HTTP_PROXY: url },
    });
    http.globalAgent = proxyAgent;
    configureHttpAgents();

    const targetUrl = 'http://127.0.0.1:1/rpc';
    const request = clients[0].create(targetUrl);
    await expect(request()).resolves.toBe('0x2a');
    await expect(request()).resolves.toBe('0x2a');
    expect(http.globalAgent).toBe(proxyAgent);
    expect(requestPaths).toEqual([targetUrl, targetUrl]);
    expect(requestsPerSocket.size).toBe(2);
  });

  it.each(clients)(
    'keeps HTTPS CONNECT proxy routing and fresh TLS sockets with $name',
    async ({ create }) => {
      const endpoint = await listenTlsServer();
      const connectTargets: (string | undefined)[] = [];
      server.on('connect', (request, clientSocket, head) => {
        connectTargets.push(request.url);
        if (request.url !== `127.0.0.1:${endpoint.port}`) {
          clientSocket.destroy();
          return;
        }
        const upstream = connect(endpoint.port, '127.0.0.1');
        extraSockets.add(clientSocket);
        extraSockets.add(upstream);
        upstream.on('error', () => clientSocket.destroy());
        clientSocket.on('error', () => upstream.destroy());
        upstream.on('close', () => clientSocket.destroy());
        clientSocket.on('close', () => upstream.destroy());
        upstream.once('connect', () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) upstream.write(head);
          clientSocket.pipe(upstream);
          upstream.pipe(clientSocket);
        });
      });
      https.globalAgent.destroy();
      const proxyEnv = { HTTPS_PROXY: url };
      const agent = new https.Agent({
        keepAlive: true,
        ca: testServerCertificate,
        rejectUnauthorized: true,
        proxyEnv,
      });
      https.globalAgent = agent;
      const options = agent.options;
      configureHttpAgents();
      const request = create(endpoint.url);

      await expect(request()).resolves.toBe('0x2a');
      await expect(request()).resolves.toBe('0x2a');
      expect(https.globalAgent).toBe(agent);
      expect(agent.options).toBe(options);
      expect(agent.options.proxyEnv).toBe(proxyEnv);
      expect(agent.options.ca).toBe(testServerCertificate);
      expect(agent.options.rejectUnauthorized).toBe(true);
      expect(connectTargets).toEqual([
        `127.0.0.1:${endpoint.port}`,
        `127.0.0.1:${endpoint.port}`,
      ]);
      expect(requests).toBe(2);
      expect(requestsPerSocket.size).toBe(2);
    },
  );

  it('disables HTTPS socket reuse while keeping TLS defaults', () => {
    const defaultCurve = DEFAULT_ECDH_CURVE;
    const defaultOptions = { ...https.globalAgent.options };
    configureHttpAgents();

    expect(https.globalAgent).toBeInstanceOf(https.Agent);
    expect(https.globalAgent).toHaveProperty('keepAlive', false);
    expect(https.globalAgent.options).toEqual(defaultOptions);
    expect(https.globalAgent.options.rejectUnauthorized).not.toBe(false);
    expect(DEFAULT_ECDH_CURVE).toBe(defaultCurve);
  });
});
