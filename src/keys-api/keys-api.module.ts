import { Module, HttpException } from '@nestjs/common';
import { Histogram } from 'prom-client';
import { getToken } from '@willsoto/nestjs-prometheus';
import { FetchModule } from '@lido-nestjs/fetch';
import { MiddlewareModule } from '@lido-nestjs/middleware';

import { KeysApiService } from './keys-api.service';
import { ConfigModule } from 'common/config';
import { METRIC_KEYS_API_REQUEST_DURATION } from 'common/prometheus';

@Module({
  imports: [
    MiddlewareModule,

    ConfigModule,
    FetchModule.forFeatureAsync({
      async useFactory(requestMetric: Histogram<string>) {
        return {
          middlewares: [
            async (next) => {
              const endTimer = requestMetric.startTimer();
              try {
                const result = await next();
                endTimer({ result: 'success', status: 200 });
                return result;
              } catch (error) {
                const status =
                  error instanceof HttpException
                    ? error.getStatus()
                    : 'unknown';
                endTimer({ result: 'error', status });
                throw error;
              }
            },
          ],
        };
      },
      inject: [getToken(METRIC_KEYS_API_REQUEST_DURATION)],
    }),
  ],
  providers: [KeysApiService],
  exports: [KeysApiService],
})
export class KeysApiModule {}
