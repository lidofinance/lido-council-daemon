import {
  JsonRpcBatchProvider,
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
import { RpcBatchProvider, RpcProvider } from './interfaces';
import { getProviderFactory } from './provider.factory';
import { ProviderService } from './provider.service';

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
