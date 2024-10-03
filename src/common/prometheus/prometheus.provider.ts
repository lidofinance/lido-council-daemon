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
  METRIC_DUPLICATED_KEYS_TOTAL,
  METRIC_INVALID_KEYS_TOTAL,
  METRIC_UNVET_ATTEMPTS,
  METRIC_DATA_BUS_ACCOUNT_BALANCE,
  METRIC_DATA_BUS_RPC_REQUEST_DURATION,
  METRIC_DATA_BUS_RPC_REQUEST_ERRORS,
  METRIC_JOB_DURATION,
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

export const PrometheusUnvetKeysCounterProvider = makeCounterProvider({
  name: METRIC_UNVET_ATTEMPTS,
  help: 'Attempts to unvet keys',
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

export const PrometheusDataBusAccountBalanceProvider = makeGaugeProvider({
  name: METRIC_DATA_BUS_ACCOUNT_BALANCE,
  help: 'DataBus guardian account balance',
  labelNames: ['chainId'] as const,
});

export const PrometheusDataBusRPCRequestsHistogramProvider =
  makeHistogramProvider({
    name: METRIC_DATA_BUS_RPC_REQUEST_DURATION,
    help: 'DataBus RPC request duration',
    buckets: [0.1, 0.2, 0.3, 0.6, 1, 1.5, 2, 5],
  });

export const PrometheusDataBusRPCErrorsCounterProvider = makeCounterProvider({
  name: METRIC_DATA_BUS_RPC_REQUEST_ERRORS,
  help: 'Number of DataBus RPC requests errors',
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
  buckets: [0.1, 0.3, 1, 3, 5, 10, 30, 60, 100, 180, 300],
  labelNames: ['result', 'status'] as const,
});

export const PrometheusDuplicatedKeysProvider = makeGaugeProvider({
  name: METRIC_DUPLICATED_KEYS_TOTAL,
  help: 'Number of duplicated keys',
  labelNames: ['type', 'stakingModuleId'] as const,
});

export const PrometheusInvalidKeysProvider = makeGaugeProvider({
  name: METRIC_INVALID_KEYS_TOTAL,
  help: 'Number of invalid keys',
  labelNames: ['stakingModuleId'] as const,
});

export const PrometheusJobDurationProvider = makeHistogramProvider({
  name: METRIC_JOB_DURATION,
  help: 'Job duration',
  buckets: [0.1, 0.3, 1, 3, 5, 10, 30, 60, 100, 180, 300],
  labelNames: ['jobName', 'stakingModuleId'] as const,
});
