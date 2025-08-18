import { DynamicModule, Module } from '@nestjs/common';
import { FallbackProviderModule } from '@lido-nestjs/execution';

@Module({})
export class TestProviderModule {
  static forRoot(): DynamicModule {
    return {
      module: TestProviderModule,
      global: true,
      imports: [
        FallbackProviderModule.forRootAsync({
          useFactory: async () => ({
            urls: ['http://localhost:8545'],
            network: 5,
            // Add maxRetries to handle test failures gracefully
            maxRetries: 0,
          }),
          inject: [],
        }),
      ],
      exports: [FallbackProviderModule],
    };
  }
}
