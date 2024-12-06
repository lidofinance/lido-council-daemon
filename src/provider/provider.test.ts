import { Formatter, StaticJsonRpcProvider } from '@ethersproject/providers';
import { DynamicModule, Module } from '@nestjs/common';
import { Configuration } from 'common/config';
import { RpcBatchProvider, RpcProvider } from './interfaces';
import { ProviderService } from './provider.service';

export const TEST_SERVER_PORT = 8545;
export const TEST_SERVER_URL = `http://127.0.0.1:${TEST_SERVER_PORT}`;

const getProviderFactory = () => {
  return async (): Promise<RpcProvider> => {
    class FormatterTest extends Formatter {
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
          this._formatter = new FormatterTest();
        }
        return this._formatter;
      }

      clone() {
        return new Provider(TEST_SERVER_URL);
      }
    }

    return new Provider(TEST_SERVER_URL);
  };
};

@Module({})
export class TestProviderModule {
  static forRoot(): DynamicModule {
    return {
      module: TestProviderModule,
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
