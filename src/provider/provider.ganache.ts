import { Formatter, StaticJsonRpcProvider } from '@ethersproject/providers';
import { DynamicModule, Module } from '@nestjs/common';
import { Configuration } from 'common/config';
import { RpcBatchProvider, RpcProvider } from './interfaces';
import { ProviderService } from './provider.service';

export const GANACHE_PORT = 8545;
export const GANACHE_URL = `http://127.0.0.1:${GANACHE_PORT}`;

const getProviderFactory = () => {
  return async (): Promise<RpcProvider> => {
    class FormatterGanache extends Formatter {
      blockTag(blockTag: any): any {
        if (typeof blockTag === 'object' && blockTag != null) {
          return 'latest';
        }

        return super.blockTag(blockTag);
      }
    }

    class Provider extends StaticJsonRpcProvider {
      static _formatter: Formatter | null = null;

      static getFormatter(): Formatter {
        if (this._formatter == null) {
          this._formatter = new FormatterGanache();
        }
        return this._formatter;
      }

      clone() {
        return new Provider(GANACHE_URL);
      }
    }

    return new Provider(GANACHE_URL);
  };
};

@Module({})
export class GanacheProviderModule {
  static forRoot(): DynamicModule {
    return {
      module: GanacheProviderModule,
      global: true,
      providers: [
        ProviderService,
        {
          provide: RpcProvider,
          useFactory: getProviderFactory(),
          inject: [Configuration],
        },
        {
          provide: RpcBatchProvider,
          useFactory: getProviderFactory(),
          inject: [Configuration],
        },
      ],
      exports: [ProviderService, RpcProvider, RpcBatchProvider],
    };
  }
}
