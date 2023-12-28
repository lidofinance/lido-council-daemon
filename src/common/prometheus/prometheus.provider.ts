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
  METRIC_VALIDATED_DEPOSITS_TOTAL,
  METRIC_INTERSECTIONS_TOTAL,
  METRIC_DEPOSITED_KEYS_TOTAL,
  METRIC_OPERATORS_KEYS_TOTAL,
  METRIC_KEYS_API_REQUEST_DURATION,
  METRIC_DUPLICATED_VETTED_UNUSED_KEYS_EVENT_COUNTER,
  METRIC_DUPLICATED_USED_KEYS_EVENT_COUNTER,
  METRIC_INVALID_KEYS_EVENT_COUNTER,
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
  labelNames: ['version', 'name', 'network'] as const,
});

export const PrometheusValidatedDepositsProvider = makeGaugeProvider({
  name: METRIC_VALIDATED_DEPOSITS_TOTAL,
  help: 'Number of deposits by validation',
  labelNames: ['type', 'stakingModuleId'] as const,
});

export const PrometheusIntersectionsProvider = makeGaugeProvider({
  name: METRIC_INTERSECTIONS_TOTAL,
  help: 'Number of keys intersections',
  labelNames: ['type', 'stakingModuleId'] as const,
});

export const PrometheusDepositedKeysProvider = makeGaugeProvider({
  name: METRIC_DEPOSITED_KEYS_TOTAL,
  help: 'Number of keys in the deposit contract',
  labelNames: ['type', 'stakingModuleId'] as const,
});

export const PrometheusOperatorsKeysProvider = makeGaugeProvider({
  name: METRIC_OPERATORS_KEYS_TOTAL,
  help: 'Number of node operators keys',
  labelNames: ['type', 'stakingModuleId'] as const,
});

export const PrometheusKeysApiRequestsProvider = makeHistogramProvider({
  name: METRIC_KEYS_API_REQUEST_DURATION,
  help: 'Duration of data collection requests by keys-api',
  buckets: [0.1, 0.2, 0.3, 0.6, 1, 1.5, 2, 5],
  labelNames: ['result', 'status'] as const,
});

export const PrometheusVettedUnusedKeysEventProvider = makeCounterProvider({
  name: METRIC_DUPLICATED_VETTED_UNUSED_KEYS_EVENT_COUNTER,
  help: 'Number of duplicated vetted unused keys events',
  labelNames: ['stakingModuleId'] as const,
});

export const PrometheusUsedKeysEventProvider = makeCounterProvider({
  name: METRIC_DUPLICATED_USED_KEYS_EVENT_COUNTER,
  help: 'Number of duplicated used keys events',
  labelNames: ['stakingModuleId'] as const,
});

export const PrometheusInvalidKeysEventProvider = makeGaugeProvider({
  name: METRIC_INVALID_KEYS_EVENT_COUNTER,
  help: 'Number of invalid keys',
  labelNames: ['stakingModuleId'] as const,
});
