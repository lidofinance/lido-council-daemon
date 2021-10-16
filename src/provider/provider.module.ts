import {
  JsonRpcProvider,
  StaticJsonRpcProvider,
} from '@ethersproject/providers';
import { Module } from '@nestjs/common';
import { getToken } from '@willsoto/nestjs-prometheus';
import { Configuration } from 'common/config';
import {
  METRIC_RPC_REQUEST_ERRORS,
  METRIC_RPC_REQUEST_DURATION,
} from 'common/prometheus';
import { Counter, Histogram } from 'prom-client';
import { ProviderService } from './provider.service';

@Module({
  providers: [
    ProviderService,
    {
      provide: JsonRpcProvider,
      useFactory: async (
        requestsHistogram: Histogram<string>,
        errorsCounter: Counter<string>,
        config: Configuration,
      ) => {
        class RpcProvider extends StaticJsonRpcProvider {
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
        }

        return new RpcProvider(config.RPC_URL);
      },
      inject: [
        getToken(METRIC_RPC_REQUEST_DURATION),
        getToken(METRIC_RPC_REQUEST_ERRORS),
        Configuration,
      ],
    },
  ],
  exports: [ProviderService],
})
export class ProviderModule {}
