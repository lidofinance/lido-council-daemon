import { RpcMetricsService } from './rpc-metrics.service';
import {
  BaseMetricLabels,
  RpcMetricsModuleOptions,
  RpcProviderConfig,
  RpcRequestBatchedEvent,
  RpcResponseBatchedEvent,
} from './interfaces/rpc-metrics.interface';
import { RpcMetricsRegistry } from './interfaces/prometheus-metrics.interface';

describe('RpcMetricsService', () => {
  const config: RpcProviderConfig = {
    network: 'ethereum',
    chainId: 1,
    layer: 'el',
    providerFactory: jest.fn(),
  };

  const baseLabels: BaseMetricLabels = {
    network: config.network,
    layer: config.layer,
    chain_id: String(config.chainId),
    provider: 'alchemy.com',
  };

  const options: RpcMetricsModuleOptions = {
    providers: [],
  };

  const createMetricsRegistry = (): jest.Mocked<RpcMetricsRegistry> => ({
    httpRpcRequestsTotal: { inc: jest.fn() },
    httpRpcBatchSize: { observe: jest.fn() },
    httpRpcResponseSeconds: { observe: jest.fn() },
    httpRpcRequestPayloadBytes: { observe: jest.fn() },
    httpRpcResponsePayloadBytes: { observe: jest.fn() },
    rpcRequestTotal: { inc: jest.fn() },
  });

  const createStalePendingRequests = (
    count: number,
    staleStartTime: number,
  ): Map<string, { startTime: number; config: RpcProviderConfig }> => {
    const pendingRequests = new Map<
      string,
      { startTime: number; config: RpcProviderConfig }
    >();

    for (let index = 0; index < count; index++) {
      pendingRequests.set(`ethereum:el:stale-${index}`, {
        startTime: staleStartTime,
        config,
      });
    }

    return pendingRequests;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should normalize provider labels correctly', () => {
    const metricsRegistry = createMetricsRegistry();
    const service = new RpcMetricsService(options, metricsRegistry);

    expect(
      (service as any).normalizeProvider(
        'https://eth-mainnet.g.alchemy.com/v2/test',
      ),
    ).toBe('alchemy.com');
    expect((service as any).normalizeProvider('https://rpc.ankr.com/eth')).toBe(
      'ankr.com',
    );
    expect((service as any).normalizeProvider('127.0.0.1:8545')).toBe(
      '127.0.0.1:8545',
    );
    expect((service as any).normalizeProvider('https://127.0.0.1:8545')).toBe(
      '127.0.0.1:8545',
    );
    expect((service as any).normalizeProvider('rpc.ankr.com')).toBe('ankr.com');
    expect((service as any).normalizeProvider('RPC.ANKR.COM')).toBe('ankr.com');
    expect((service as any).normalizeProvider('LOCALHOST')).toBe('localhost');
    expect((service as any).normalizeProvider('')).toBe('unknown');
    expect((service as any).normalizeProvider('http://[')).toBe('unknown');
  });

  it('should clean up stale pending requests on unmatched responses', () => {
    const metricsRegistry = createMetricsRegistry();
    const service = new RpcMetricsService(options, metricsRegistry);
    const now = 1_000_000;
    const cleanupThreshold =
      (RpcMetricsService as any).PENDING_REQUESTS_CLEANUP_THRESHOLD + 1;
    const maxAge = (RpcMetricsService as any).PENDING_REQUESTS_MAX_AGE_MS + 1;

    jest.spyOn(Date, 'now').mockReturnValue(now);

    (service as any).pendingRequests = createStalePendingRequests(
      cleanupThreshold,
      now - maxAge,
    );

    (service as any).trackResponseTime(
      [{ jsonrpc: '2.0', id: 'fresh-response', method: 'eth_blockNumber' }],
      baseLabels,
      config,
    );

    expect((service as any).pendingRequests.size).toBe(0);
    expect(
      metricsRegistry.httpRpcResponseSeconds.observe,
    ).not.toHaveBeenCalled();
  });

  it('should clean up stale pending requests when a new request starts', () => {
    const metricsRegistry = createMetricsRegistry();
    const service = new RpcMetricsService(options, metricsRegistry);
    const now = 2_000_000;
    const cleanupThreshold =
      (RpcMetricsService as any).PENDING_REQUESTS_CLEANUP_THRESHOLD + 1;
    const maxAge = (RpcMetricsService as any).PENDING_REQUESTS_MAX_AGE_MS + 1;
    const requestEvent: RpcRequestBatchedEvent = {
      action: 'provider:request-batched',
      domain: 'https://eth-mainnet.g.alchemy.com/v2/test',
      request: [{ jsonrpc: '2.0', id: 'fresh-request', method: 'eth_chainId' }],
    };

    jest.spyOn(Date, 'now').mockReturnValue(now);

    (service as any).pendingRequests = createStalePendingRequests(
      cleanupThreshold,
      now - maxAge,
    );

    (service as any).handleRpcEvent(requestEvent, config);

    const pendingRequests = (service as any).pendingRequests as Map<
      string,
      { startTime: number; config: RpcProviderConfig }
    >;

    expect(pendingRequests.size).toBe(1);
    expect(Array.from(pendingRequests.keys())).toEqual([
      'ethereum:el:fresh-request',
    ]);
  });

  it('should record response timing for matched responses after cleanup', () => {
    const metricsRegistry = createMetricsRegistry();
    const service = new RpcMetricsService(options, metricsRegistry);
    const now = 3_000_000;
    const responseEvent: RpcResponseBatchedEvent = {
      action: 'provider:response-batched',
      domain: 'https://eth-mainnet.g.alchemy.com/v2/test',
      request: [{ jsonrpc: '2.0', id: 'matched', method: 'eth_call' }],
      response: [{ jsonrpc: '2.0', id: 'matched', result: '0x1' }],
    };

    jest.spyOn(Date, 'now').mockReturnValue(now);

    (service as any).pendingRequests = new Map([
      [
        'ethereum:el:matched',
        {
          startTime: now - 2_000,
          config,
        },
      ],
    ]);

    (service as any).handleRpcEvent(responseEvent, config);

    expect(metricsRegistry.httpRpcResponseSeconds.observe).toHaveBeenCalledWith(
      expect.objectContaining(baseLabels),
      2,
    );
    expect((service as any).pendingRequests.size).toBe(0);
  });

  describe('provider normalization', () => {
    it('should normalize hosted rpc urls to the second-level domain', () => {
      const service = new RpcMetricsService(options, createMetricsRegistry());

      expect(
        (service as any).normalizeProvider(
          'https://eth-mainnet.g.alchemy.com/v2/test',
        ),
      ).toBe('alchemy.com');
      expect(
        (service as any).normalizeProvider('https://rpc.ankr.com/eth'),
      ).toBe('ankr.com');
    });

    it('should preserve ipv4 addresses with ports', () => {
      const service = new RpcMetricsService(options, createMetricsRegistry());

      expect((service as any).normalizeProvider('127.0.0.1:8545')).toBe(
        '127.0.0.1:8545',
      );
      expect((service as any).normalizeProvider('https://127.0.0.1:8545')).toBe(
        '127.0.0.1:8545',
      );
    });

    it('should return unknown for empty or malformed urls', () => {
      const service = new RpcMetricsService(options, createMetricsRegistry());

      expect((service as any).normalizeProvider('')).toBe('unknown');
      expect((service as any).normalizeProvider('http://[')).toBe('unknown');
    });

    it('should parse hostnames and second-level domains correctly', () => {
      const service = new RpcMetricsService(options, createMetricsRegistry());

      expect((service as any).extractHostname('https://rpc.ankr.com/eth')).toBe(
        'rpc.ankr.com',
      );
      expect((service as any).extractHostname('https://127.0.0.1:8545')).toBe(
        '127.0.0.1:8545',
      );
      expect(
        (service as any).extractSecondLevelDomain('eth-mainnet.g.alchemy.com'),
      ).toBe('alchemy.com');
      expect((service as any).extractSecondLevelDomain('RPC.ANKR.COM')).toBe(
        'ankr.com',
      );
    });

    it('should detect ipv4 addresses with and without ports', () => {
      const service = new RpcMetricsService(options, createMetricsRegistry());

      expect((service as any).isIpAddress('127.0.0.1')).toBe(true);
      expect((service as any).isIpAddress('127.0.0.1:8545')).toBe(true);
      expect((service as any).isIpAddress('rpc.ankr.com')).toBe(false);
    });
  });
});
