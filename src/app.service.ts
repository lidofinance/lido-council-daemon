import { Inject, LoggerService, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { APP_NAME, APP_VERSION } from 'app.constants';
import { METRIC_BUILD_INFO } from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Gauge } from 'prom-client';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { CHAINS } from '@lido-sdk/constants';
import { getHeapStatistics } from 'v8';

export class AppService implements OnModuleInit {
  constructor(
    private provider: SimpleFallbackJsonRpcBatchProvider,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @InjectMetric(METRIC_BUILD_INFO) private buildInfo: Gauge<string>,
  ) {}

  async onModuleInit(): Promise<void> {
    const providerNetwork = await this.provider.getNetwork();
    const network =
      CHAINS[providerNetwork.chainId]?.toLocaleLowerCase() ||
      providerNetwork.name;
    const version = APP_VERSION;
    const name = APP_NAME;

    const { heap_size_limit } = getHeapStatistics();
    const heapLimit = Math.round(heap_size_limit / 1024 / 1024).toString();

    this.buildInfo.labels({ version, name, network, heapLimit }).inc();
    this.logger.log('Init app', {
      name,
      version,
      network,
      heapLimit,
    });
  }
}
