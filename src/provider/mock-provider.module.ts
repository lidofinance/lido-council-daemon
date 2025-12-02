import { DynamicModule, Module } from '@nestjs/common';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { getNetwork } from '@ethersproject/networks';
import { CHAINS } from '@lido-nestjs/constants';
import { Configuration } from 'common/config';
import { DATA_BUS_PROVIDER_TOKEN } from './data-bus-provider.module';

const mockLogger = {
  log: () => {
    /* noop */
  },
  error: () => {
    /* noop */
  },
  warn: () => {
    /* noop */
  },
  debug: () => {
    /* noop */
  },
  verbose: () => {
    /* noop */
  },
};

const getMockProviderFactory = () => {
  return (config: Configuration): SimpleFallbackJsonRpcBatchProvider => {
    class MockProvider extends SimpleFallbackJsonRpcBatchProvider {
      // NOTE: MockProvider uses Goerli network, but the specific chain ID is not functionally important
      // for unit tests - it's just a constant value. Unit tests are isolated and don't depend on
      // actual network behavior. The only requirement is that the chain ID's genesis fork version
      // matches the test fixtures (key signatures in keys.fixtures.ts were generated for Goerli).
      // In production, the real chain ID comes from configuration, not from this mock.
      // There's no need to change to Hoodi/other networks unless testing network-specific logic.
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
      mockLogger as any,
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
        {
          provide: DATA_BUS_PROVIDER_TOKEN,
          useExisting: SimpleFallbackJsonRpcBatchProvider,
        },
      ],
      exports: [SimpleFallbackJsonRpcBatchProvider, DATA_BUS_PROVIDER_TOKEN],
    };
  }
}
