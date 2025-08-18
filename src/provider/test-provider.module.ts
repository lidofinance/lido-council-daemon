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
            network: parseInt(process.env.CHAIN_ID || '17000', 10),
            // Add maxRetries to handle test failures gracefully
            maxRetries: 1,
            logRetries: false,
          }),
          inject: [],
        }),
      ],
      exports: [FallbackProviderModule],
    };
  }
}
