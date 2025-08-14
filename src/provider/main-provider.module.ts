import { DynamicModule, Global, Module } from '@nestjs/common';
import { FallbackProviderModule } from '@lido-nestjs/execution';
import { Configuration } from '../common/config';
import { ProviderService } from './provider.service';

@Global()
@Module({})
export class MainProviderModule {
  static forRootAsync(): DynamicModule {
    return {
      module: MainProviderModule,
      global: true,
      imports: [
        FallbackProviderModule.forRootAsync({
          useFactory: async (config: Configuration) => ({
            urls: [config.RPC_URL],
            network: 560048, // Ethereum mainnet, можно настроить через конфиг
          }),
          inject: [Configuration],
        }),
      ],
      providers: [ProviderService],
      exports: [FallbackProviderModule, ProviderService],
    };
  }
}
