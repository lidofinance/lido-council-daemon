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
  PrometheusGuardianInfoGaugeProvider,
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
  PrometheusHistoricalFrontRunProvider,
  PrometheusHttpRpcRequestsTotalProvider,
  PrometheusHttpRpcBatchSizeProvider,
  PrometheusHttpRpcResponseSecondsProvider,
  PrometheusHttpRpcRequestPayloadBytesProvider,
  PrometheusHttpRpcResponsePayloadBytesProvider,
  PrometheusRpcRequestTotalProvider,
  PrometheusNonceLatestProvider,
  PrometheusNoncePendingProvider,
  PrometheusNonceGapProvider,
  PrometheusDepositsCacheBytesProvider,
  PrometheusDepositsCacheCountProvider,
  PrometheusSigningKeysCacheBytesProvider,
  PrometheusSigningKeysCacheCountProvider,
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
  PrometheusGuardianInfoGaugeProvider,
  PrometheusValidatedDepositsProvider,
  PrometheusIntersectionsProvider,
  PrometheusDepositedKeysProvider,
  PrometheusOperatorsKeysProvider,
  PrometheusKeysApiRequestsProvider,
  PrometheusDuplicatedKeysProvider,
  PrometheusInvalidKeysProvider,
  PrometheusUnvetKeysCounterProvider,
  PrometheusJobDurationProvider,
  PrometheusHistoricalFrontRunProvider,
  // RPC Metrics providers
  PrometheusHttpRpcRequestsTotalProvider,
  PrometheusHttpRpcBatchSizeProvider,
  PrometheusHttpRpcResponseSecondsProvider,
  PrometheusHttpRpcRequestPayloadBytesProvider,
  PrometheusHttpRpcResponsePayloadBytesProvider,
  PrometheusRpcRequestTotalProvider,
  RpcMetricsPrometheusService,
  // Nonce Metrics providers
  PrometheusNonceLatestProvider,
  PrometheusNoncePendingProvider,
  PrometheusNonceGapProvider,
  // Events Cache Metrics providers
  PrometheusDepositsCacheBytesProvider,
  PrometheusDepositsCacheCountProvider,
  PrometheusSigningKeysCacheBytesProvider,
  PrometheusSigningKeysCacheCountProvider,
];

PrometheusModule.global = true;
PrometheusModule.providers = providers;
PrometheusModule.exports = providers;
