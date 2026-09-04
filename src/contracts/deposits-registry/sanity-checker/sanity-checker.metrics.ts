import {
  makeCounterProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';
import { METRICS_PREFIX } from 'common/prometheus/prometheus.constants';

export const METRIC_FRESH_DEPOSIT_ROOT_MISMATCHES = `${METRICS_PREFIX}fresh_deposit_root_mismatches_total`;
export const METRIC_CONSECUTIVE_FRESH_DEPOSIT_ROOT_MISMATCHES = `${METRICS_PREFIX}consecutive_fresh_deposit_root_mismatches`;

export const FreshDepositRootMismatchesProvider = makeCounterProvider({
  name: METRIC_FRESH_DEPOSIT_ROOT_MISMATCHES,
  help: 'Number of fresh deposit event root mismatches',
});

export const ConsecutiveFreshDepositRootMismatchesProvider = makeGaugeProvider({
  name: METRIC_CONSECUTIVE_FRESH_DEPOSIT_ROOT_MISMATCHES,
  help: 'Number of consecutive fresh deposit event root mismatches',
});
