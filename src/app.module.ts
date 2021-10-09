import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheInterceptor, MiddlewareConsumer, Module } from '@nestjs/common';

import { SWAGGER_URL } from 'common/swagger';
import { PROMETHEUS_METRICS_URL } from 'common/prometheus';
import { ThrottlerModule, ThrottlerBehindProxyGuard } from 'common/throttler';
import { LoggerMiddleware, MetricsMiddleware } from 'common/middleware';
import { PrometheusModule, PrometheusQueryProvider } from 'common/prometheus';
import { ConfigModule } from 'common/config';
import { CacheModule } from 'common/cache';
import { SentryInterceptor } from 'common/sentry';
import { StatisticModule } from 'statistic';

@Module({
  imports: [
    StatisticModule,
    PrometheusModule,
    CacheModule,
    ThrottlerModule,
    ConfigModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard },
    { provide: APP_INTERCEPTOR, useClass: SentryInterceptor },
    { provide: APP_INTERCEPTOR, useClass: CacheInterceptor },
    PrometheusQueryProvider,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MetricsMiddleware, LoggerMiddleware)
      .exclude(`${SWAGGER_URL}/(.*)`, SWAGGER_URL, PROMETHEUS_METRICS_URL)
      .forRoutes('*');
  }
}
