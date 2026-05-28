export interface EventEmitterLike {
  on(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
}

export interface RpcProviderConfig {
  /** Network name (e.g., 'ethereum', 'gnosis') */
  network: string;
  /** Chain ID */
  chainId: string | number;
  /** Layer identifier (e.g., 'el' for execution layer, 'cl' for consensus layer) */
  layer: string;
  /** Provider with event emitter for tracking RPC events */
  providerFactory: () => ProviderWithEvents | Promise<ProviderWithEvents>;
}

export interface RpcMetricsModuleOptions {
  /** List of providers to track */
  providers: RpcProviderConfig[];
}

export interface RpcMetricsModuleAsyncOptions {
  imports?: any[];
  useFactory: (
    ...args: any[]
  ) => RpcMetricsModuleOptions | Promise<RpcMetricsModuleOptions>;
  inject?: any[];
}

export interface ProviderWithEvents {
  eventEmitter?: EventEmitterLike;
}

export interface BaseMetricLabels {
  network: string;
  layer: string;
  chain_id: string;
  provider: string;
  [key: string]: string;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any[];
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: JsonRpcError;
}

export interface RpcRequestBatchedEvent {
  action: 'provider:request-batched';
  domain: string;
  request: JsonRpcRequest[];
}

export interface RpcResponseBatchedEvent {
  action: 'provider:response-batched';
  domain: string;
  request: JsonRpcRequest[];
  response: JsonRpcResponse | JsonRpcResponse[];
}

export interface RpcResponseBatchedErrorEvent {
  action: 'provider:response-batched:error';
  domain: string;
  request: JsonRpcRequest[];
  error: Error & { status?: number };
}

export type RpcEvent =
  | RpcRequestBatchedEvent
  | RpcResponseBatchedEvent
  | RpcResponseBatchedErrorEvent;
