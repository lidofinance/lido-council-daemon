import { Formatter, JsonRpcProvider } from '@ethersproject/providers';
import { EventType, Listener } from '@ethersproject/abstract-provider';

import { ModuleRef } from '@nestjs/core';

import { Configuration } from 'common/config';

import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Counter, Histogram } from 'prom-client';
import { MAX_TIME_WITHOUT_NEW_BLOCKS_MS } from 'provider';
import { RpcProvider } from './interfaces';
import { FormatterWithEIP1898 } from './formatter.service';

export class OnBlockError extends Error {
  lastBlock: number;

  constructor(message, lastBlock) {
    super(message);
    this.lastBlock = lastBlock;
  }
}

export const getProviderFactory = (
  SourceProvider: typeof JsonRpcProvider,
  providerUrlPath = 'RPC_URL',
) => {
  return async (
    requestsHistogram: Histogram<string>,
    errorsCounter: Counter<string>,
    moduleRef: ModuleRef,
    config: Configuration,
  ): Promise<RpcProvider> => {
    const getLogger = () =>
      moduleRef.get(WINSTON_MODULE_NEST_PROVIDER, {
        strict: false,
      });

    class Provider extends SourceProvider {
      async _uncachedDetectNetwork() {
        try {
          return await super._uncachedDetectNetwork();
        } catch (error) {
          const logger = await getLogger();
          logger.error(error);
          process.exit(1);
        }
      }

      static _formatter: Formatter | null = null;

      static getFormatter(): Formatter {
        if (this._formatter == null) {
          this._formatter = new FormatterWithEIP1898();
        }
        return this._formatter;
      }

      on(eventName: EventType, listener: Listener): this {
        let dieTimer: NodeJS.Timeout | null = null;

        const startDieTimer = (lastBlock: number) => {
          if (dieTimer) clearTimeout(dieTimer);

          dieTimer = setTimeout(async () => {
            const logger = await getLogger();
            const error = new OnBlockError(
              'There were no new blocks for a long time',
              lastBlock,
            );

            logger.error(error);
            process.exit(1);
          }, MAX_TIME_WITHOUT_NEW_BLOCKS_MS);
        };

        if (eventName === 'block') {
          startDieTimer(-1);

          super.on(eventName, function (this: any, ...args) {
            startDieTimer(args[0]);
            return listener?.apply(this, args);
          });
        }

        return super.on(eventName, listener);
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
        return new Provider(config[providerUrlPath]);
      }
    }

    return new Provider(config[providerUrlPath]);
  };
};
