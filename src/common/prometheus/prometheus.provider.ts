import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import {
  METRIC_PAUSE_ATTEMPTS,
  METRIC_SENT_MESSAGES,
  METRIC_RPC_REQUEST_ERRORS,
  METRIC_RPC_REQUEST_DURATION,
  METRIC_ACCOUNT_BALANCE,
  METRIC_BLOCK_DATA_REQUEST_DURATION,
  METRIC_BLOCK_DATA_REQUEST_ERRORS,
  METRIC_BUILD_INFO,
  METRIC_DEPOSITED_KEYS_TOTAL,
  METRIC_OPERATORS_KEYS_TOTAL,
} from './prometheus.constants';

export const PrometheusTransportMessageCounterProvider = makeCounterProvider({
  name: METRIC_SENT_MESSAGES,
  help: 'Number of messages sent to the broker',
  labelNames: ['messageType'] as const,
});

export const PrometheusPauseDepositsCounterProvider = makeCounterProvider({
  name: METRIC_PAUSE_ATTEMPTS,
  help: 'Attempts to pause deposits',
});

export const PrometheusRPCRequestsHistogramProvider = makeHistogramProvider({
  name: METRIC_RPC_REQUEST_DURATION,
  help: 'RPC request duration',
  buckets: [0.1, 0.2, 0.3, 0.6, 1, 1.5, 2, 5],
});

export const PrometheusRPCErrorsCounterProvider = makeCounterProvider({
  name: METRIC_RPC_REQUEST_ERRORS,
  help: 'Number of RPC requests errors',
});

export const PrometheusAccountBalanceProvider = makeGaugeProvider({
  name: METRIC_ACCOUNT_BALANCE,
  help: 'Guardian account balance',
});

export const PrometheusBlockDataRequestsProvider = makeHistogramProvider({
  name: METRIC_BLOCK_DATA_REQUEST_DURATION,
  help: 'Duration of data collection requests in the current block',
  buckets: [0.1, 0.2, 0.3, 0.6, 1, 1.5, 2, 5],
});

export const PrometheusBlockDataErrorsCounterProvider = makeCounterProvider({
  name: METRIC_BLOCK_DATA_REQUEST_ERRORS,
  help: 'Number of errors of data collection request for the current block',
});

export const PrometheusBuildInfoGaugeProvider = makeCounterProvider({
  name: METRIC_BUILD_INFO,
  help: 'Build information',
  labelNames: ['version', 'name'] as const,
});

export const PrometheusDepositedKeysProvider = makeGaugeProvider({
  name: METRIC_DEPOSITED_KEYS_TOTAL,
  help: 'Number of keys in the deposit contract',
  labelNames: ['type'] as const,
});

export const PrometheusOperatorsKeysProvider = makeGaugeProvider({
  name: METRIC_OPERATORS_KEYS_TOTAL,
  help: 'Number of node operators keys',
  labelNames: ['type'] as const,
});
