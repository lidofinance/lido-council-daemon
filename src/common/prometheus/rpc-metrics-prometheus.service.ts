import { Injectable, Inject } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { getToken } from '@willsoto/nestjs-prometheus';
import {
  METRIC_HTTP_RPC_REQUESTS_TOTAL,
  METRIC_HTTP_RPC_BATCH_SIZE,
  METRIC_HTTP_RPC_RESPONSE_SECONDS,
  METRIC_HTTP_RPC_REQUEST_PAYLOAD_BYTES,
  METRIC_HTTP_RPC_RESPONSE_PAYLOAD_BYTES,
  METRIC_RPC_REQUEST_TOTAL,
} from './prometheus.constants';
import { RpcMetricsRegistry } from 'common/rpc-metrics';

@Injectable()
export class RpcMetricsPrometheusService implements RpcMetricsRegistry {
  constructor(
    @Inject(getToken(METRIC_HTTP_RPC_REQUESTS_TOTAL))
    public readonly httpRpcRequestsTotal: Counter<string>,
    @Inject(getToken(METRIC_HTTP_RPC_BATCH_SIZE))
    public readonly httpRpcBatchSize: Histogram<string>,
    @Inject(getToken(METRIC_HTTP_RPC_RESPONSE_SECONDS))
    public readonly httpRpcResponseSeconds: Histogram<string>,
    @Inject(getToken(METRIC_HTTP_RPC_REQUEST_PAYLOAD_BYTES))
    public readonly httpRpcRequestPayloadBytes: Histogram<string>,
    @Inject(getToken(METRIC_HTTP_RPC_RESPONSE_PAYLOAD_BYTES))
    public readonly httpRpcResponsePayloadBytes: Histogram<string>,
    @Inject(getToken(METRIC_RPC_REQUEST_TOTAL))
    public readonly rpcRequestTotal: Counter<string>,
  ) {}
}
