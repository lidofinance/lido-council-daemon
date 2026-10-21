import http = require('node:http');
import { once } from 'node:events';
import { AddressInfo, Socket } from 'node:net';
import { brotliCompressSync } from 'node:zlib';
import {
  Body,
  Controller,
  HttpCode,
  INestApplication,
  Injectable,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Interval, ScheduleModule, Timeout } from '@nestjs/schedule';
import { FetchModule, FetchService } from '@lido-nestjs/fetch';
import {
  FallbackProviderModule,
  SimpleFallbackJsonRpcBatchProvider,
} from '@lido-nestjs/execution';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { register } from '@prometheus-io/client';
import { WinstonModule } from 'nest-winston';
import { transports } from 'winston';
import { HealthModule } from 'health';

@Injectable()
class RuntimeScheduleProbe {
  intervalTicks = 0;
  timeoutCalls = 0;
  private resolveInterval!: () => void;
  private resolveTimeout!: () => void;
  readonly intervalReady = new Promise<void>((resolve) => {
    this.resolveInterval = resolve;
  });
  readonly timeoutReady = new Promise<void>((resolve) => {
    this.resolveTimeout = resolve;
  });

  @Interval(10)
  onInterval() {
    this.intervalTicks += 1;
    if (this.intervalTicks >= 2) this.resolveInterval();
  }

  @Timeout(10)
  onTimeout() {
    this.timeoutCalls += 1;
    this.resolveTimeout();
  }
}

@Controller('echo')
class RuntimeEchoController {
  @Post()
  @HttpCode(200)
  echo(@Body() body: Record<string, unknown>) {
    return body;
  }
}

describe('Node runtime integration', () => {
  let app: INestApplication | undefined;
  let appUrl: string;
  let rpcServer: http.Server;
  const rpcSockets = new Set<Socket>();
  let fetchService: FetchService;
  let provider: SimpleFallbackJsonRpcBatchProvider;

  beforeAll(async () => {
    rpcServer = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        const payload = JSON.parse(body);
        const reply = ({ id, method }: { id: number; method: string }) => {
          const results = {
            eth_chainId: '0x7a69',
            net_version: '31337',
            eth_blockNumber: '0x2a',
          };
          return {
            jsonrpc: '2.0',
            id,
            ...(method in results
              ? { result: results[method] }
              : { error: { code: -32601, message: 'Method not found' } }),
          };
        };
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Connection', 'close');
        response.end(
          JSON.stringify(
            Array.isArray(payload) ? payload.map(reply) : reply(payload),
          ),
        );
      });
    });
    rpcServer.on('connection', (socket) => {
      rpcSockets.add(socket);
      socket.on('close', () => rpcSockets.delete(socket));
    });
    const listening = once(rpcServer, 'listening');
    rpcServer.listen(0, '127.0.0.1');
    await listening;
    const rpcUrl = `http://127.0.0.1:${(rpcServer.address() as AddressInfo).port}`;

    register.clear();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ScheduleModule.forRoot(),
        HealthModule,
        PrometheusModule.register({
          defaultMetrics: {
            enabled: true,
            config: { prefix: 'runtime_' },
          },
        }),
        FetchModule.forFeature({}),
        WinstonModule.forRoot({
          transports: [new transports.Console({ silent: true })],
        }),
        FallbackProviderModule.forRootAsync({
          useFactory: () => ({
            urls: [rpcUrl],
            network: 31337,
            maxRetries: 1,
            requestTimeoutMs: 1000,
            logSuccessfulAttempts: false,
          }),
          inject: [],
        }),
      ],
      controllers: [RuntimeEchoController],
      providers: [RuntimeScheduleProbe],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    appUrl = await app.getUrl();
    fetchService = app.get(FetchService);
    provider = app.get(SimpleFallbackJsonRpcBatchProvider);
  });

  afterAll(async () => {
    await app?.close();
    for (const socket of rpcSockets) socket.destroy();
    if (rpcServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        rpcServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    register.clear();
  });

  function postBody(body: Buffer, encoding?: string) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = http.request(
        `${appUrl}/echo`,
        {
          method: 'POST',
          agent: false,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
            ...(encoding ? { 'Content-Encoding': encoding } : {}),
          },
        },
        (response) => {
          let responseBody = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (responseBody += chunk));
          response.on('error', reject);
          response.on('end', () => {
            resolve({ status: response.statusCode!, body: responseBody });
          });
        },
      );
      request.on('error', reject);
      request.setTimeout(2000, () =>
        request.destroy(new Error('HTTP timeout')),
      );
      request.end(body);
    });
  }

  it('runs interval and timeout decorators with real timers', async () => {
    const probe = app!.get(RuntimeScheduleProbe);
    await Promise.all([probe.intervalReady, probe.timeoutReady]);
    expect(probe.intervalTicks).toBeGreaterThanOrEqual(2);
    expect(probe.timeoutCalls).toBe(1);
  });

  it('serves the real memory health check through the injected fetch service', async () => {
    const health = await fetchService.fetchJson(`${appUrl}/health`);
    expect(health).toMatchObject({
      status: 'ok',
      info: { memoryHeap: { status: 'up' } },
      error: {},
    });
  });

  it('exports Node heap, event loop and GC metrics', async () => {
    const metrics = await fetchService.fetchText(`${appUrl}/metrics`);
    expect(metrics).toMatch(/^runtime_nodejs_heap_size_used_bytes \d/m);
    expect(metrics).toMatch(/^runtime_nodejs_eventloop_lag_seconds /m);
    expect(metrics).toContain(
      '# TYPE runtime_nodejs_gc_duration_seconds histogram',
    );
  });

  it('resolves the fallback provider through Nest and reads a local RPC', async () => {
    await expect(provider.perform('getBlockNumber', {})).resolves.toBe('0x2a');
  });

  it('parses JSON sent by the injected fetch service', async () => {
    const body = { message: 'Node runtime', value: 42 };
    await expect(
      fetchService.fetchJson(`${appUrl}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    ).resolves.toEqual(body);
  });

  it('decompresses Brotli JSON bodies', async () => {
    const body = { message: 'compressed JSON', value: 42 };
    const response = await postBody(
      brotliCompressSync(Buffer.from(JSON.stringify(body))),
      'br',
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual(body);
  });

  it.each([
    { name: 'JSON', body: Buffer.from('{'), encoding: undefined },
    { name: 'Brotli', body: Buffer.from('invalid brotli'), encoding: 'br' },
  ])('rejects malformed $name bodies', async ({ body, encoding }) => {
    const response = await postBody(body, encoding);
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ statusCode: 400 });
  });

  it('limits the decompressed JSON body size', async () => {
    const body = JSON.stringify({ value: 'x'.repeat(128 * 1024) });
    const response = await postBody(
      brotliCompressSync(Buffer.from(body)),
      'br',
    );
    expect(response.status).toBe(413);
  });
});
