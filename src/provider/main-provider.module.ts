import { DynamicModule, Global, Module } from '@nestjs/common';
import { FallbackProviderModule } from '@lido-nestjs/execution';
import { Configuration } from '../common/config';
import { Histogram } from 'prom-client';
import { getToken } from '@willsoto/nestjs-prometheus';
import { METRIC_RPC_REQUEST_DURATION } from 'common/prometheus';

@Global()
@Module({})
export class MainProviderModule {
  static forRootAsync(): DynamicModule {
    return {
      module: MainProviderModule,
      global: true,
      imports: [
        FallbackProviderModule.forRootAsync({
          useFactory: async (
            config: Configuration,
            requestMetric: Histogram<string>,
          ) => ({
            urls: config.PROVIDERS_URLS ?? [config.RPC_URL],
            network: config.CHAIN_ID,
            instanceLabel: 'EL1',
            fetchMiddlewares: [
              async (next) => {
                const endTimer = requestMetric.startTimer();

                try {
                  const result = await next();
                  endTimer({ result: 'success' });
                  return result;
                } catch (error) {
                  endTimer({ result: 'error' });
                  throw error;
                } finally {
                  endTimer();
                }
              },
            ],
          }),
          inject: [Configuration, getToken(METRIC_RPC_REQUEST_DURATION)],
        }),
      ],
      exports: [FallbackProviderModule],
    };
  }
}
