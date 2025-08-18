import { DynamicModule, Module } from '@nestjs/common';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { getNetwork } from '@ethersproject/networks';
import { CHAINS } from '@lido-sdk/constants';
import { Configuration } from 'common/config';

const getMockProviderFactory = () => {
  return (config: Configuration): SimpleFallbackJsonRpcBatchProvider => {
    class MockProvider extends SimpleFallbackJsonRpcBatchProvider {
      async detectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }

      async _detectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }

      async getNetwork() {
        return getNetwork(CHAINS.Goerli);
      }
    }

    return new MockProvider(
      {
        // Use new array-based config with fallback to old single URL
        urls: config.PROVIDERS_URLS || [
          config.RPC_URL || 'http://localhost:8545',
        ],
        // Use required chain ID config
        network: config.CHAIN_ID,
      },
      {} as any,
    );
  };
};

@Module({})
export class MockProviderModule {
  static forRoot(): DynamicModule {
    return {
      module: MockProviderModule,
      global: true,
      providers: [
        {
          provide: SimpleFallbackJsonRpcBatchProvider,
          useFactory: getMockProviderFactory(),
          inject: [Configuration],
        },
      ],
      exports: [SimpleFallbackJsonRpcBatchProvider],
    };
  }
}
