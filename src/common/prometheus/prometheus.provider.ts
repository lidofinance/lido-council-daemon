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
  buckets: [0.1, 0.2, 0.3, 0.6, 1, 2, 5],
});

export const PrometheusRPCErrorsCounterProvider = makeCounterProvider({
  name: METRIC_RPC_REQUEST_ERRORS,
  help: 'RPC errors',
});

export const PrometheusAccountBalanceProvider = makeGaugeProvider({
  name: METRIC_ACCOUNT_BALANCE,
  help: 'Account balance',
});
