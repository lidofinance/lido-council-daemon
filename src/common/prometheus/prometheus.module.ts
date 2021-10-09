import { PrometheusModule as PrometheusModuleSource } from '@willsoto/nestjs-prometheus';
import { PROMETHEUS_METRICS_URL } from './prometheus.constants';
import { PrometheusController } from './prometheus.controller';

export const PrometheusModule = PrometheusModuleSource.register({
  controller: PrometheusController,
  path: PROMETHEUS_METRICS_URL,
  defaultMetrics: { enabled: true },
});
