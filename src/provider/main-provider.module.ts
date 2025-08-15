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
            urls: [config.RPC_URL],
            network: 560048,
          }),
          inject: [Configuration],
        }),
      ],
      exports: [FallbackProviderModule],
    };
  }
}
