import { DynamicModule, Module } from '@nestjs/common';
import {
  FallbackProviderModule,
  SimpleFallbackJsonRpcBatchProvider,
} from '@lido-nestjs/execution';
import { Configuration } from '../common/config';
import { getToken } from '@willsoto/nestjs-prometheus';
import { METRIC_DATA_BUS_RPC_REQUEST_DURATION } from 'common/prometheus';
import { Histogram } from 'prom-client';

export const DATA_BUS_PROVIDER_TOKEN = 'DATA_BUS_PROVIDER';

@Module({})
export class DataBusProviderModule {
  static forRootAsync(): DynamicModule {
    return {
      module: DataBusProviderModule,
      imports: [
        FallbackProviderModule.forRootAsync({
          useFactory: async (
            config: Configuration,
            requestMetric: Histogram<string>,
          ) => ({
            // Use new array-based config with fallback to old single URL
            urls: config.EVM_CHAIN_DATA_BUS_PROVIDERS_URLS ?? [
              config.EVM_CHAIN_DATA_BUS_PROVIDER_URL,
            ],
            // Use required chain ID config
            network: config.EVM_CHAIN_DATA_BUS_CHAIN_ID,
            logRetries: false,
            maxRetries: 1,
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
          inject: [
            Configuration,
            getToken(METRIC_DATA_BUS_RPC_REQUEST_DURATION),
          ],
        }),
      ],
      providers: [
        {
          provide: DATA_BUS_PROVIDER_TOKEN,
          useExisting: SimpleFallbackJsonRpcBatchProvider,
        },
      ],
      exports: [DATA_BUS_PROVIDER_TOKEN],
    };
  }
}
