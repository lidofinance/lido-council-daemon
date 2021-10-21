import {
  JsonRpcBatchProvider,
  JsonRpcProvider,
  StaticJsonRpcProvider,
} from '@ethersproject/providers';
import { getNetwork } from '@ethersproject/networks';
import { CHAINS } from '@lido-sdk/constants';
import { DynamicModule, Module } from '@nestjs/common';
import { Configuration } from 'common/config';
import { RpcBatchProvider, RpcProvider } from './interfaces';
import { ProviderService } from './provider.service';

const getProviderFactory = (SourceProvider: typeof JsonRpcProvider) => {
  return async (config: Configuration): Promise<RpcProvider> => {
    class Provider extends SourceProvider {
      async _uncachedDetectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }

      clone() {
        return new Provider(config.RPC_URL);
      }
    }

    return new Provider(config.RPC_URL);
  };
};

@Module({})
export class MockProviderModule {
  static forRoot(): DynamicModule {
    return {
      module: MockProviderModule,
      global: true,
      providers: [
        ProviderService,
        {
          provide: RpcProvider,
          useFactory: getProviderFactory(StaticJsonRpcProvider),
          inject: [Configuration],
        },
        {
          provide: RpcBatchProvider,
          useFactory: getProviderFactory(JsonRpcBatchProvider),
          inject: [Configuration],
        },
      ],
      exports: [ProviderService, RpcProvider, RpcBatchProvider],
    };
  }
}
