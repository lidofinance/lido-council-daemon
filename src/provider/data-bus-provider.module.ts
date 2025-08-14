import { DynamicModule, Module } from '@nestjs/common';
import { ExtendedJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { Configuration } from '../common/config';

// Уникальный токен для Data Bus провайдера
export const DATA_BUS_PROVIDER_TOKEN = 'DATA_BUS_PROVIDER';

@Module({})
export class DataBusProviderModule {
  static forRootAsync(): DynamicModule {
    return {
      module: DataBusProviderModule,
      providers: [
        // Создаем отдельный инстанс провайдера с уникальным токеном
        {
          provide: DATA_BUS_PROVIDER_TOKEN,
          useFactory: async (config: Configuration) => {
            return new ExtendedJsonRpcBatchProvider(
              config.EVM_CHAIN_DATA_BUS_PROVIDER_URL,
              1, // network
            );
          },
          inject: [Configuration],
        },
      ],
      exports: [DATA_BUS_PROVIDER_TOKEN],
    };
  }
}
