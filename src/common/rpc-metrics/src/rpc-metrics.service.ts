import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  RPC_METRICS_CONSTANTS,
  RPC_METRICS_CONFIG,
} from './rpc-metrics.constants';
import {
  RpcMetricsModuleOptions,
  RpcProviderConfig,
  BaseMetricLabels,
  JsonRpcRequest,
  JsonRpcResponse,
  RpcEvent,
  ProviderWithEvents,
  EventEmitterLike,
} from './interfaces/rpc-metrics.interface';
import { RpcMetricsRegistry } from './interfaces/prometheus-metrics.interface';

export const RPC_METRICS_REGISTRY = 'RPC_METRICS_REGISTRY';

interface ProviderContext {
  config: RpcProviderConfig;
  provider: ProviderWithEvents;
  cleanup: () => void;
}

@Injectable()
export class RpcMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RpcMetricsService.name);
  private providerContexts: ProviderContext[] = [];
  private pendingRequests = new Map<
    string,
    { startTime: number; config: RpcProviderConfig }
  >();

  constructor(
    @Inject(RPC_METRICS_CONFIG)
    private readonly options: RpcMetricsModuleOptions,
    @Inject(RPC_METRICS_REGISTRY)
    private readonly metricsRegistry: RpcMetricsRegistry,
  ) {}

  async onModuleInit() {
    for (const config of this.options.providers) {
      try {
        const provider = await config.providerFactory();
        const cleanup = this.setupEventListeners(provider, config);
        this.providerContexts.push({ config, provider, cleanup });
        this.logger.log(
          `RPC metrics initialized for ${config.network}/${config.layer} (chainId: ${config.chainId})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to initialize RPC metrics for ${config.network}/${config.layer}:`,
          error,
        );
      }
    }
  }

  onModuleDestroy() {
    this.providerContexts.forEach((ctx) => ctx.cleanup());
    this.providerContexts = [];
    this.pendingRequests.clear();
  }

  private setupEventListeners(
    provider: ProviderWithEvents,
    config: RpcProviderConfig,
  ): () => void {
    if (!provider || !this.hasEventEmitter(provider)) {
      this.logger.warn(
        `Provider eventEmitter not available for ${config.network}/${config.layer}, RPC metrics will not be tracked`,
      );
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return () => {};
    }

    const emitter = provider.eventEmitter as EventEmitterLike;
    const rpcEventHandler = (event: RpcEvent) => {
      this.handleRpcEvent(event, config);
    };

    emitter.on('rpc', rpcEventHandler);
    return () => emitter.off('rpc', rpcEventHandler);
  }

  private hasEventEmitter(provider: ProviderWithEvents): boolean {
    return provider && typeof provider.eventEmitter?.on === 'function';
  }

  private handleRpcEvent(event: RpcEvent, config: RpcProviderConfig) {
    try {
      switch (event.action) {
        case 'provider:request-batched':
          this.trackRequestStart(event, config);
          break;
        case 'provider:response-batched':
          this.trackBatchedResponse(event, config);
          break;
        case 'provider:response-batched:error':
          this.trackBatchedErrorResponse(event, config);
          break;
      }
    } catch (error) {
      this.logger.error('Error handling RPC event:', error);
    }
  }

  private trackRequestStart(
    event: Extract<RpcEvent, { action: 'provider:request-batched' }>,
    config: RpcProviderConfig,
  ) {
    const requestKey = this.generateRequestKey(event.request, config);
    this.pendingRequests.set(requestKey, { startTime: Date.now(), config });
  }

  private trackResponseTime(
    requests: JsonRpcRequest[],
    baseLabels: BaseMetricLabels,
    config: RpcProviderConfig,
  ) {
    const requestKey = this.generateRequestKey(requests, config);
    const pending = this.pendingRequests.get(requestKey);

    if (pending) {
      const duration = (Date.now() - pending.startTime) / 1000;
      this.metricsRegistry.httpRpcResponseSeconds.observe(baseLabels, duration);
      this.pendingRequests.delete(requestKey);

      if (this.pendingRequests.size > 1000) {
        this.cleanupOldRequests();
      }
    }
  }

  private trackBatchedResponse(
    event: Extract<RpcEvent, { action: 'provider:response-batched' }>,
    config: RpcProviderConfig,
  ) {
    const baseLabels = this.getBaseLabels(event.domain, config);
    const batchSize = event.request.length;

    this.metricsRegistry.httpRpcRequestsTotal.inc({
      ...baseLabels,
      batched: batchSize > 1 ? 'true' : 'false',
      response_code: RPC_METRICS_CONSTANTS.RESPONSE_CODES.SUCCESS,
      result: RPC_METRICS_CONSTANTS.RESULTS.SUCCESS,
    });
    this.trackResponseTime(event.request, baseLabels, config);

    this.metricsRegistry.httpRpcBatchSize.observe(baseLabels, batchSize);
    this.trackPayloadSizes(baseLabels, event.request, event.response);
    this.trackRpcCallMetrics(
      event.request,
      event.response,
      baseLabels.provider,
      config,
    );
  }

  private trackBatchedErrorResponse(
    event: Extract<RpcEvent, { action: 'provider:response-batched:error' }>,
    config: RpcProviderConfig,
  ) {
    const baseLabels = this.getBaseLabels(event.domain, config);
    const batchSize = event.request.length;
    const errorStatusCode = event.error?.status
      ? String(event.error.status)
      : '5xx';
    const errorCode = errorStatusCode?.startsWith('4')
      ? RPC_METRICS_CONSTANTS.RESPONSE_CODES.CLIENT_ERROR
      : RPC_METRICS_CONSTANTS.RESPONSE_CODES.SERVER_ERROR;

    this.metricsRegistry.httpRpcRequestsTotal.inc({
      ...baseLabels,
      batched: batchSize > 1 ? 'true' : 'false',
      response_code: errorCode,
      result: RPC_METRICS_CONSTANTS.RESULTS.FAIL,
    });

    this.trackResponseTime(event.request, baseLabels, config);
    this.metricsRegistry.httpRpcBatchSize.observe(baseLabels, batchSize);

    const requestSize = this.calculatePayloadSize(event.request);
    this.metricsRegistry.httpRpcRequestPayloadBytes.observe(
      baseLabels,
      requestSize,
    );

    this.trackRpcCallFailures(event.request, baseLabels.provider, config);
  }

  private getBaseLabels(
    domain: string,
    config: RpcProviderConfig,
  ): BaseMetricLabels {
    return {
      network: config.network,
      layer: config.layer,
      chain_id: String(config.chainId),
      provider: this.normalizeProvider(domain),
    };
  }

  private trackPayloadSizes(
    baseLabels: BaseMetricLabels,
    request: any,
    response?: any,
  ) {
    const requestSize = this.calculatePayloadSize(request);
    this.metricsRegistry.httpRpcRequestPayloadBytes.observe(
      baseLabels,
      requestSize,
    );

    if (response) {
      const responseSize = this.calculatePayloadSize(response);
      this.metricsRegistry.httpRpcResponsePayloadBytes.observe(
        baseLabels,
        responseSize,
      );
    }
  }

  private trackRpcCallFailures(
    requests: JsonRpcRequest[],
    provider: string,
    config: RpcProviderConfig,
  ) {
    requests.forEach((request) => {
      this.metricsRegistry.rpcRequestTotal.inc({
        network: config.network,
        layer: config.layer,
        chain_id: String(config.chainId),
        provider,
        method: request.method,
        result: RPC_METRICS_CONSTANTS.RESULTS.FAIL,
        rpc_error_code: '',
      });
    });
  }

  private trackRpcCallMetrics(
    requests: JsonRpcRequest[],
    responses: JsonRpcResponse | JsonRpcResponse[],
    provider: string,
    config: RpcProviderConfig,
  ) {
    const responseArray = Array.isArray(responses) ? responses : [responses];

    requests.forEach((request, index) => {
      const response = responseArray[index];
      const rpcErrorCode = response?.error?.code
        ? String(response.error.code)
        : '';
      const methodResult = response?.error
        ? RPC_METRICS_CONSTANTS.RESULTS.FAIL
        : RPC_METRICS_CONSTANTS.RESULTS.SUCCESS;

      this.metricsRegistry.rpcRequestTotal.inc({
        network: config.network,
        layer: config.layer,
        chain_id: String(config.chainId),
        provider,
        method: request.method,
        result: methodResult,
        rpc_error_code: rpcErrorCode,
      });
    });
  }

  private normalizeProvider(domain: string): string {
    try {
      if (!domain) return RPC_METRICS_CONSTANTS.PROVIDERS.UNKNOWN;

      const hostname = this.extractHostname(domain);

      if (this.isIpAddress(hostname)) {
        return hostname;
      }

      return this.extractSecondLevelDomain(hostname);
    } catch {
      return RPC_METRICS_CONSTANTS.PROVIDERS.UNKNOWN;
    }
  }

  private extractHostname(domain: string): string {
    if (!domain.startsWith('http')) {
      return domain;
    }

    const parsed = new URL(domain);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  }

  private isIpAddress(hostname: string): boolean {
    return /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(hostname);
  }

  private extractSecondLevelDomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}.${
        parts[parts.length - 1]
      }`.toLowerCase();
    }
    return hostname.toLowerCase();
  }

  private calculatePayloadSize(data: any): number {
    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return 0;
    }
  }

  private generateRequestKey(
    requests: JsonRpcRequest[],
    config: RpcProviderConfig,
  ): string {
    const ids = requests.map((r) => r.id).join(',');
    return `${config.network}:${config.layer}:${ids}`;
  }

  private cleanupOldRequests() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key, { startTime }] of this.pendingRequests.entries()) {
      if (startTime < fiveMinutesAgo) {
        this.pendingRequests.delete(key);
      }
    }
  }
}
