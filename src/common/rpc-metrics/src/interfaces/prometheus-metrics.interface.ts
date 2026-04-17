/**
 * Interface for the metrics registry that RpcMetricsService expects.
 * Implement this interface in your PrometheusService or metrics provider.
 */
export interface RpcMetricsRegistry {
  /** Counter: Total HTTP requests used by RPC layer */
  httpRpcRequestsTotal: MetricCounter<HttpRpcRequestLabels>;

  /** Histogram: Distribution of JSON-RPC calls bundled in each HTTP request */
  httpRpcBatchSize: MetricHistogram<BaseRpcLabels>;

  /** Histogram: Distribution of RPC response times in seconds */
  httpRpcResponseSeconds: MetricHistogram<BaseRpcLabels>;

  /** Histogram: Distribution of request payload sizes in bytes */
  httpRpcRequestPayloadBytes: MetricHistogram<BaseRpcLabels>;

  /** Histogram: Distribution of response payload sizes in bytes */
  httpRpcResponsePayloadBytes: MetricHistogram<BaseRpcLabels>;

  /** Counter: Total number of individual RPC method calls */
  rpcRequestTotal: MetricCounter<RpcRequestLabels>;
}

export interface BaseRpcLabels {
  network: string;
  layer: string;
  chain_id: string;
  provider: string;
  [key: string]: string;
}

export interface HttpRpcRequestLabels extends BaseRpcLabels {
  batched: string;
  response_code: string;
  result: string;
}

export interface RpcRequestLabels extends BaseRpcLabels {
  method: string;
  result: string;
  rpc_error_code: string;
}

export interface MetricCounter<T extends Record<string, string>> {
  inc(labels: T, value?: number): void;
}

export interface MetricHistogram<T extends Record<string, string>> {
  observe(labels: T, value: number): void;
}

/**
 * Example implementation with prom-client:
 *
 * ```typescript
 * import { Counter, Histogram } from 'prom-client';
 *
 * export class PrometheusService implements RpcMetricsRegistry {
 *   httpRpcRequestsTotal = new Counter({
 *     name: 'http_rpc_requests_total',
 *     help: 'Counts total HTTP requests used by RPC layer',
 *     labelNames: ['network', 'layer', 'chain_id', 'provider', 'batched', 'response_code', 'result'],
 *   });
 *
 *   httpRpcBatchSize = new Histogram({
 *     name: 'http_rpc_batch_size',
 *     help: 'Distribution of JSON-RPC calls bundled in each HTTP request',
 *     buckets: [1, 2, 5, 10, 20, 50, 100],
 *     labelNames: ['network', 'layer', 'chain_id', 'provider'],
 *   });
 *
 *   httpRpcResponseSeconds = new Histogram({
 *     name: 'http_rpc_response_seconds',
 *     help: 'Distribution of RPC response times in seconds',
 *     buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
 *     labelNames: ['network', 'layer', 'chain_id', 'provider'],
 *   });
 *
 *   httpRpcRequestPayloadBytes = new Histogram({
 *     name: 'http_rpc_request_payload_bytes',
 *     help: 'Distribution of request payload sizes in bytes',
 *     buckets: [128, 256, 512, 1024, 2048, 4096, 8192, 16384],
 *     labelNames: ['network', 'layer', 'chain_id', 'provider'],
 *   });
 *
 *   httpRpcResponsePayloadBytes = new Histogram({
 *     name: 'http_rpc_response_payload_bytes',
 *     help: 'Distribution of response payload sizes in bytes',
 *     buckets: [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
 *     labelNames: ['network', 'layer', 'chain_id', 'provider'],
 *   });
 *
 *   rpcRequestTotal = new Counter({
 *     name: 'rpc_request_total',
 *     help: 'Total number of RPC requests',
 *     labelNames: ['network', 'layer', 'chain_id', 'provider', 'method', 'result', 'rpc_error_code'],
 *   });
 * }
 * ```
 */
