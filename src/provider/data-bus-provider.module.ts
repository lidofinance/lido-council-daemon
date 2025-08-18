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
            // TODO: URLs and chainId from config
            urls: [config.EVM_CHAIN_DATA_BUS_PROVIDER_URL],
            network: 10200,
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
