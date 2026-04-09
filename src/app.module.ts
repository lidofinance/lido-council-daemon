import { Module } from '@nestjs/common';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { AppService } from 'app.service';

import { ConfigModule, Configuration } from 'common/config';
import { LoggerModule } from 'common/logger';
import {
  PrometheusModule,
  RpcMetricsPrometheusService,
} from 'common/prometheus';
import { RpcMetricsModule } from 'common/rpc-metrics';
import { GuardianModule } from 'guardian';
import { MainProviderModule } from 'provider/main-provider.module';
import { DATA_BUS_PROVIDER_TOKEN } from 'provider/data-bus-provider.module';
import { HealthModule } from 'health';
import { RepositoryModule } from 'contracts/repository';

@Module({
  imports: [
    MainProviderModule.forRootAsync(),
    ConfigModule.forRoot(),
    PrometheusModule,
    LoggerModule,
    GuardianModule,
    HealthModule,
    RepositoryModule,
    RpcMetricsModule.forRootAsync(
      {
        useFactory: (
          config: Configuration,
          mainProvider: SimpleFallbackJsonRpcBatchProvider,
          dataBusProvider: SimpleFallbackJsonRpcBatchProvider,
        ) => ({
          providers: [
            {
              network: 'ethereum',
              chainId: config.CHAIN_ID,
              layer: 'el',
              providerFactory: () => mainProvider,
            },
            {
              network: 'data-bus',
              chainId: config.EVM_CHAIN_DATA_BUS_CHAIN_ID,
              layer: 'el',
              providerFactory: () => dataBusProvider,
            },
          ],
        }),
        inject: [
          Configuration,
          SimpleFallbackJsonRpcBatchProvider,
          DATA_BUS_PROVIDER_TOKEN,
        ],
      },
      { useExisting: RpcMetricsPrometheusService },
    ),
  ],
  providers: [AppService],
})
export class AppModule {}
