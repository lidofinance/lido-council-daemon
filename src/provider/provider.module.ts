import {
  JsonRpcBatchProvider,
  JsonRpcProvider,
  StaticJsonRpcProvider,
} from '@ethersproject/providers';
import { DynamicModule, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getToken } from '@willsoto/nestjs-prometheus';
import { Configuration } from 'common/config';
import {
  METRIC_RPC_REQUEST_ERRORS,
  METRIC_RPC_REQUEST_DURATION,
} from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Counter, Histogram } from 'prom-client';
import { RpcBatchProvider, RpcProvider } from './interfaces';
import { ProviderService } from './provider.service';

const getProviderFactory = (SourceProvider: typeof JsonRpcProvider) => {
  return async (
    requestsHistogram: Histogram<string>,
    errorsCounter: Counter<string>,
    moduleRef: ModuleRef,
    config: Configuration,
  ): Promise<RpcProvider> => {
    class Provider extends SourceProvider {
      async _uncachedDetectNetwork() {
        try {
          return await super._uncachedDetectNetwork();
        } catch (error) {
          const logger = await moduleRef.get(WINSTON_MODULE_NEST_PROVIDER, {
            strict: false,
          });
          logger.error(error);
          process.exit(1);
        }
      }

      async send(method, params) {
        const endTimer = requestsHistogram.startTimer();

        try {
          const result = await super.send(method, params);
          return result;
        } catch (error) {
          errorsCounter.inc();
          throw error;
        } finally {
          endTimer();
        }
      }

      clone() {
        return new Provider(config.RPC_URL);
      }
    }

    return new Provider(config.RPC_URL);
  };
};

const providerDeps = [
  getToken(METRIC_RPC_REQUEST_DURATION),
  getToken(METRIC_RPC_REQUEST_ERRORS),
  ModuleRef,
  Configuration,
];

@Module({})
export class ProviderModule {
  static forRoot(): DynamicModule {
    return {
      module: ProviderModule,
      global: true,
      providers: [
        ProviderService,
        {
          provide: RpcProvider,
          useFactory: getProviderFactory(StaticJsonRpcProvider),
          inject: providerDeps,
        },
        {
          provide: RpcBatchProvider,
          useFactory: getProviderFactory(JsonRpcBatchProvider),
          inject: providerDeps,
        },
      ],
      exports: [ProviderService, RpcProvider, RpcBatchProvider],
    };
  }
}
