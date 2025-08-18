import { DynamicModule, Module } from '@nestjs/common';
import {
  FallbackProviderModule,
  SimpleFallbackJsonRpcBatchProvider,
} from '@lido-nestjs/execution';
import { Configuration } from '../common/config';

export const DATA_BUS_PROVIDER_TOKEN = 'DATA_BUS_PROVIDER';

@Module({})
export class DataBusProviderModule {
  static forRootAsync(): DynamicModule {
    return {
      module: DataBusProviderModule,
      imports: [
        FallbackProviderModule.forFeatureAsync({
          useFactory: async (config: Configuration) => ({
            // Use new array-based config with fallback to old single URL
            urls: config.EVM_CHAIN_DATA_BUS_PROVIDERS_URLS ?? [
              config.EVM_CHAIN_DATA_BUS_PROVIDER_URL,
            ],
            // Use required chain ID config
            network: config.EVM_CHAIN_DATA_BUS_CHAIN_ID,
            logRetries: false,
            maxRetries: 1,
          }),
          inject: [Configuration],
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
