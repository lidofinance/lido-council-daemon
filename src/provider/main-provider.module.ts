import { DynamicModule, Global, Module } from '@nestjs/common';
import { FallbackProviderModule } from '@lido-nestjs/execution';
import { Configuration } from '../common/config';

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
            // Use new array-based config with fallback to old single URL
            urls: config.PROVIDERS_URLS ?? [config.RPC_URL],
            // Use required chain ID config
            network: config.CHAIN_ID,
          }),
          inject: [Configuration],
        }),
      ],
      exports: [FallbackProviderModule],
    };
  }
}
