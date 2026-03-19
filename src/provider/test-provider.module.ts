import { DynamicModule, Module } from '@nestjs/common';
import { FallbackProviderModule } from '@lido-nestjs/execution';
import { Configuration } from '../common/config';

@Module({})
export class TestProviderModule {
  static forRoot(): DynamicModule {
    return {
      module: TestProviderModule,
      global: true,
      imports: [
        FallbackProviderModule.forRootAsync({
          useFactory: async (config?: Configuration) => ({
            // Use new array-based config with fallback to localhost for tests
            urls: config?.PROVIDERS_URLS || ['http://127.0.0.1:8545'],
            // Use chain ID config with fallback to CHAIN_ID env var for tests
            network: 560048,
            // Add maxRetries to handle test failures gracefully
            maxRetries: 1,
            logRetries: false,
            // Add connection timeout for CI
            timeout: 10000, // 10 seconds
            // Add retry delay
            retryDelay: 1000, // 1 second
          }),
          inject: [Configuration],
        }),
      ],
      exports: [FallbackProviderModule],
    };
  }
}
