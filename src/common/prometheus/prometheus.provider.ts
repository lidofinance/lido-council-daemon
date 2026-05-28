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
  METRIC_HISTORICAL_FRONT_RUN_TOTAL,
  METRIC_DATA_BUS_ACCOUNT_BALANCE,
  METRIC_DATA_BUS_RPC_REQUEST_DURATION,
  METRIC_DATA_BUS_RPC_REQUEST_ERRORS,
  METRIC_JOB_DURATION,
  METRIC_HTTP_RPC_REQUESTS_TOTAL,
  METRIC_HTTP_RPC_BATCH_SIZE,
  METRIC_HTTP_RPC_RESPONSE_SECONDS,
  METRIC_HTTP_RPC_REQUEST_PAYLOAD_BYTES,
  METRIC_HTTP_RPC_RESPONSE_PAYLOAD_BYTES,
  METRIC_RPC_REQUEST_TOTAL,
  METRIC_NONCE_LATEST,
  METRIC_NONCE_PENDING,
  METRIC_NONCE_GAP,
  METRIC_DEPOSITS_CACHE_BYTES,
  METRIC_DEPOSITS_CACHE_COUNT,
  METRIC_SIGNING_KEYS_CACHE_BYTES,
  METRIC_SIGNING_KEYS_CACHE_COUNT,
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
  labelNames: ['result'] as const,
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
    labelNames: ['result'] as const,
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
  labelNames: ['version', 'name', 'network', 'heapLimit'] as const,
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

export const PrometheusHistoricalFrontRunProvider = makeGaugeProvider({
  name: METRIC_HISTORICAL_FRONT_RUN_TOTAL,
  help: 'Number of historical front-run and wrong WC type keys',
  labelNames: ['type'] as const,
});

export const PrometheusJobDurationProvider = makeHistogramProvider({
  name: METRIC_JOB_DURATION,
  help: 'Job duration',
  buckets: [0.1, 0.3, 1, 3, 5, 10, 30, 60, 100, 180, 300],
  labelNames: ['jobName', 'stakingModuleId'] as const,
});

// RPC Metrics providers
export const PrometheusHttpRpcRequestsTotalProvider = makeCounterProvider({
  name: METRIC_HTTP_RPC_REQUESTS_TOTAL,
  help: 'Total HTTP requests to RPC providers',
  labelNames: [
    'network',
    'layer',
    'chain_id',
    'provider',
    'batched',
    'response_code',
    'result',
  ] as const,
});

export const PrometheusHttpRpcBatchSizeProvider = makeHistogramProvider({
  name: METRIC_HTTP_RPC_BATCH_SIZE,
  help: 'Distribution of JSON-RPC calls bundled in each HTTP request',
  buckets: [1, 2, 5, 10, 20, 50, 100],
  labelNames: ['network', 'layer', 'chain_id', 'provider'] as const,
});

export const PrometheusHttpRpcResponseSecondsProvider = makeHistogramProvider({
  name: METRIC_HTTP_RPC_RESPONSE_SECONDS,
  help: 'Distribution of RPC response times in seconds',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  labelNames: ['network', 'layer', 'chain_id', 'provider'] as const,
});

export const PrometheusHttpRpcRequestPayloadBytesProvider =
  makeHistogramProvider({
    name: METRIC_HTTP_RPC_REQUEST_PAYLOAD_BYTES,
    help: 'Distribution of request payload sizes in bytes',
    buckets: [128, 256, 512, 1024, 2048, 4096, 8192, 16384],
    labelNames: ['network', 'layer', 'chain_id', 'provider'] as const,
  });

export const PrometheusHttpRpcResponsePayloadBytesProvider =
  makeHistogramProvider({
    name: METRIC_HTTP_RPC_RESPONSE_PAYLOAD_BYTES,
    help: 'Distribution of response payload sizes in bytes',
    buckets: [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
    labelNames: ['network', 'layer', 'chain_id', 'provider'] as const,
  });

export const PrometheusRpcRequestTotalProvider = makeCounterProvider({
  name: METRIC_RPC_REQUEST_TOTAL,
  help: 'Total number of individual RPC method calls',
  labelNames: [
    'network',
    'layer',
    'chain_id',
    'provider',
    'method',
    'result',
    'rpc_error_code',
  ] as const,
});

// Nonce Metrics providers
export const PrometheusNonceLatestProvider = makeGaugeProvider({
  name: METRIC_NONCE_LATEST,
  help: 'Latest confirmed nonce for guardian address',
  labelNames: ['network'] as const,
});

export const PrometheusNoncePendingProvider = makeGaugeProvider({
  name: METRIC_NONCE_PENDING,
  help: 'Pending nonce for guardian address',
  labelNames: ['network'] as const,
});

export const PrometheusNonceGapProvider = makeGaugeProvider({
  name: METRIC_NONCE_GAP,
  help: 'Difference between pending and latest nonce',
  labelNames: ['network'] as const,
});

// Events Cache Metrics providers
export const PrometheusDepositsCacheBytesProvider = makeGaugeProvider({
  name: METRIC_DEPOSITS_CACHE_BYTES,
  help: 'Memory used by deposits events cache in bytes',
});

export const PrometheusDepositsCacheCountProvider = makeGaugeProvider({
  name: METRIC_DEPOSITS_CACHE_COUNT,
  help: 'Number of deposit events in cache',
});

export const PrometheusSigningKeysCacheBytesProvider = makeGaugeProvider({
  name: METRIC_SIGNING_KEYS_CACHE_BYTES,
  help: 'Memory used by signing keys events cache in bytes',
});

export const PrometheusSigningKeysCacheCountProvider = makeGaugeProvider({
  name: METRIC_SIGNING_KEYS_CACHE_COUNT,
  help: 'Number of signing key events in cache',
});
