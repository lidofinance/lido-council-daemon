// Audit focus N24-HTTP-2 (Node 24 dependency update): socket lifetime with
// the reconfigured global agents. Node 24 global agents default to
// keepAlive with a 5 s socket timeout; configureHttpAgents() turns keepAlive
// off and leaves the timeout. These tests check slow responses, socket
// cleanup after success and failure, and retained memory, for both HTTP
// clients of the daemon: the execution provider (ethers v5) and the Keys API
// client (@lido-nestjs/fetch over node-fetch).
import http = require('node:http');
import https = require('node:https');
import { once } from 'node:events';
import { AddressInfo, Socket } from 'node:net';
import v8 = require('node:v8');
import vm = require('node:vm');
import { Test } from '@nestjs/testing';
import { ExtendedJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { FetchModule, FetchService } from '@lido-nestjs/fetch';
import { configureHttpAgents } from './http-agents';

v8.setFlagsFromString('--expose-gc');
const collect = vm.runInNewContext('gc') as () => void;

type Mode = 'ok' | 'slow' | 'reset' | 'hang';

describe('audit N24-HTTP-2: socket lifetime with reconfigured agents', () => {
  let previousHttpAgent: http.Agent;
  let previousHttpsAgent: https.Agent;
  let server: http.Server;
  let url: string;
  let mode: Mode;
  let slowMs: number;
  let opened: number;
  let serverSockets: Set<Socket>;
  let fetchService: FetchService;
  let closeModule: () => Promise<void>;

  const rpc = (timeout: number) => {
    const provider = new ExtendedJsonRpcBatchProvider(
      { url, timeout },
      { name: 'local', chainId: 31337 },
    );
    return () => provider.send('eth_blockNumber', []);
  };
  const kapi = () => () =>
    fetchService.fetchJson<{ result: string }>(`${url}/v1/status`);

  const agentSockets = () =>
    [http.globalAgent.sockets, http.globalAgent.freeSockets].map(
      (group) => Object.values(group).flat().length,
    );
  const settle = (ms = 200) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FetchModule.forFeature()],
    }).compile();
    fetchService = moduleRef.get(FetchService);
    closeModule = () => moduleRef.close();
  });

  afterAll(() => closeModule());

  beforeEach(async () => {
    previousHttpAgent = http.globalAgent;
    previousHttpsAgent = https.globalAgent;
    // The Node 24 defaults, independent of the Node version running the test.
    http.globalAgent = new http.Agent({ keepAlive: true, timeout: 5000 });
    https.globalAgent = new https.Agent({ keepAlive: true, timeout: 5000 });
    configureHttpAgents();

    mode = 'ok';
    slowMs = 0;
    opened = 0;
    serverSockets = new Set();
    server = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        if (mode === 'hang') return;
        if (mode === 'reset') return request.socket.destroy();
        const reply = () => {
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify(
              body
                ? JSON.parse(body).map(({ id }: { id: number }) => ({
                    jsonrpc: '2.0',
                    id,
                    result: '0x2a',
                  }))
                : { result: '0x2a' },
            ),
          );
        };
        if (mode === 'slow') setTimeout(reply, slowMs);
        else reply();
      });
    });
    server.on('connection', (socket) => {
      opened += 1;
      serverSockets.add(socket);
      socket.on('close', () => serverSockets.delete(socket));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    http.globalAgent.destroy();
    https.globalAgent.destroy();
    http.globalAgent = previousHttpAgent;
    https.globalAgent = previousHttpsAgent;
    for (const socket of serverSockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });

  it('a response slower than the 5 s agent timeout still succeeds', async () => {
    mode = 'slow';
    slowMs = 6500;
    const started = Date.now();
    const [rpcResult, kapiResult] = await Promise.all([
      rpc(30_000)(),
      kapi()(),
    ]);
    expect(rpcResult).toBe('0x2a');
    expect(kapiResult).toEqual({ result: '0x2a' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(6400);
    await settle();
    expect(agentSockets()).toEqual([0, 0]);
    expect(serverSockets.size).toBe(0);
  }, 30_000);

  it('closes every socket after sequential and concurrent success', async () => {
    const clients = [rpc(5000), kapi()];
    for (const client of clients) {
      for (let index = 0; index < 150; index += 1) await client();
      await Promise.all(Array.from({ length: 150 }, () => client()));
    }
    await settle();
    // The provider merges concurrent calls into batches; the Keys API client
    // opens one socket per request.
    expect(opened).toBeGreaterThanOrEqual(150 + 1 + 300);
    expect(agentSockets()).toEqual([0, 0]);
    expect(serverSockets.size).toBe(0);
  }, 60_000);

  it('closes every socket after repeated connection resets', async () => {
    mode = 'reset';
    const clients = [rpc(5000), kapi()];
    let failures = 0;
    for (const client of clients) {
      for (let index = 0; index < 200; index += 1) {
        await client().catch(() => (failures += 1));
      }
    }
    await settle();
    expect(failures).toBe(400);
    expect(agentSockets()).toEqual([0, 0]);
    expect(serverSockets.size).toBe(0);
  }, 60_000);

  it('observed: a provider timeout leaves the socket open until the 5 s agent timeout or the peer closes', async () => {
    mode = 'hang';
    const client = rpc(300);
    let rejected = 0;
    for (let index = 0; index < 20; index += 1) {
      await client().catch(() => (rejected += 1));
    }
    expect(rejected).toBe(20);
    // ethers v5 rejects on its own timer and does not abort the request.
    const [activeAfterTimeout] = agentSockets();
    expect(activeAfterTimeout).toBe(20);
    expect(serverSockets.size).toBe(20);

    await settle(6000);
    // Reported in the audit record: whether the idle agent timeout frees them.
    console.log(
      JSON.stringify({
        node: process.version,
        clientSocketsAfter6s: agentSockets()[0],
        serverSocketsAfter6s: serverSockets.size,
      }),
    );
  }, 30_000);

  it('retains no heap across 3000 requests with mixed outcomes', async () => {
    const client = rpc(5000);
    const run = async (count: number) => {
      for (let index = 0; index < count; index += 1) {
        mode = index % 5 === 4 ? 'reset' : 'ok';
        await client().catch(() => undefined);
      }
    };
    await run(500);
    collect();
    const before = process.memoryUsage().heapUsed;
    await run(3000);
    await settle();
    collect();
    const growthMb = (process.memoryUsage().heapUsed - before) / 1048576;
    console.log(JSON.stringify({ node: process.version, growthMb }));
    expect(growthMb).toBeLessThan(8);
    expect(agentSockets()).toEqual([0, 0]);
    expect(serverSockets.size).toBe(0);
  }, 300_000);
});
