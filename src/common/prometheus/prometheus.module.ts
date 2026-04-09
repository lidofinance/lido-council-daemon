import { PrometheusModule as PrometheusModuleSource } from '@willsoto/nestjs-prometheus';
import {
  PrometheusPauseDepositsCounterProvider,
  PrometheusTransportMessageCounterProvider,
  PrometheusAccountBalanceProvider,
  PrometheusRPCErrorsCounterProvider,
  PrometheusRPCRequestsHistogramProvider,
  PrometheusBlockDataErrorsCounterProvider,
  PrometheusBlockDataRequestsProvider,
  PrometheusBuildInfoGaugeProvider,
  PrometheusValidatedDepositsProvider,
  PrometheusIntersectionsProvider,
  PrometheusDepositedKeysProvider,
  PrometheusOperatorsKeysProvider,
  PrometheusKeysApiRequestsProvider,
  PrometheusDuplicatedKeysProvider,
  PrometheusInvalidKeysProvider,
  PrometheusUnvetKeysCounterProvider,
  PrometheusDataBusRPCErrorsCounterProvider,
  PrometheusDataBusAccountBalanceProvider,
  PrometheusDataBusRPCRequestsHistogramProvider,
  PrometheusJobDurationProvider,
  PrometheusHttpRpcRequestsTotalProvider,
  PrometheusHttpRpcBatchSizeProvider,
  PrometheusHttpRpcResponseSecondsProvider,
  PrometheusHttpRpcRequestPayloadBytesProvider,
  PrometheusHttpRpcResponsePayloadBytesProvider,
  PrometheusRpcRequestTotalProvider,
} from './prometheus.provider';
import { METRICS_PREFIX, METRICS_URL } from './prometheus.constants';
import { RpcMetricsPrometheusService } from './rpc-metrics-prometheus.service';

export const PrometheusModule = PrometheusModuleSource.register({
  path: METRICS_URL,
  defaultMetrics: {
    enabled: true,
    config: { prefix: METRICS_PREFIX },
  },
});

const providers = [
  PrometheusTransportMessageCounterProvider,
  PrometheusPauseDepositsCounterProvider,
  PrometheusRPCRequestsHistogramProvider,
  PrometheusRPCErrorsCounterProvider,
  PrometheusAccountBalanceProvider,
  PrometheusDataBusRPCRequestsHistogramProvider,
  PrometheusDataBusRPCErrorsCounterProvider,
  PrometheusDataBusAccountBalanceProvider,
  PrometheusBlockDataRequestsProvider,
  PrometheusBlockDataErrorsCounterProvider,
  PrometheusBuildInfoGaugeProvider,
  PrometheusValidatedDepositsProvider,
  PrometheusIntersectionsProvider,
  PrometheusDepositedKeysProvider,
  PrometheusOperatorsKeysProvider,
  PrometheusKeysApiRequestsProvider,
  PrometheusDuplicatedKeysProvider,
  PrometheusInvalidKeysProvider,
  PrometheusUnvetKeysCounterProvider,
  PrometheusJobDurationProvider,
  // RPC Metrics providers
  PrometheusHttpRpcRequestsTotalProvider,
  PrometheusHttpRpcBatchSizeProvider,
  PrometheusHttpRpcResponseSecondsProvider,
  PrometheusHttpRpcRequestPayloadBytesProvider,
  PrometheusHttpRpcResponsePayloadBytesProvider,
  PrometheusRpcRequestTotalProvider,
  RpcMetricsPrometheusService,
];

PrometheusModule.global = true;
PrometheusModule.providers = providers;
PrometheusModule.exports = providers;
