import { MiddlewareConsumer, Module } from '@nestjs/common';

import { SWAGGER_URL } from 'common/swagger';
import { PROMETHEUS_METRICS_URL } from 'common/prometheus';
import { LoggerMiddleware, MetricsMiddleware } from 'common/middleware';
import { PrometheusModule, PrometheusQueryProvider } from 'common/prometheus';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { DefenderModule } from 'defender';
import { TransportModule } from 'transport';

@Module({
  imports: [
    DefenderModule,
    TransportModule,
    LoggerModule,
    PrometheusModule,
    ConfigModule,
  ],
  providers: [PrometheusQueryProvider],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MetricsMiddleware, LoggerMiddleware)
      .exclude(`${SWAGGER_URL}/(.*)`, SWAGGER_URL, PROMETHEUS_METRICS_URL)
      .forRoutes('*');
  }
}
