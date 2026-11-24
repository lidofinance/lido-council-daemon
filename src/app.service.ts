import { Inject, LoggerService, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  APP_BRANCH,
  APP_COMMIT,
  APP_NAME,
  APP_VERSION,
  assertVersionFitsBytes32,
} from 'app.constants';
import { METRIC_BUILD_INFO } from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Gauge } from '@prometheus-io/client';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { CHAINS } from '@lido-nestjs/constants';
import { getHeapStatistics } from 'v8';

export class AppService implements OnModuleInit {
  constructor(
    private provider: SimpleFallbackJsonRpcBatchProvider,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @InjectMetric(METRIC_BUILD_INFO) private buildInfo: Gauge<string>,
  ) {}

  async onModuleInit(): Promise<void> {
    assertVersionFitsBytes32(APP_VERSION);

    const providerNetwork = await this.provider.getNetwork();
    const network =
      CHAINS[providerNetwork.chainId]?.toLocaleLowerCase() ||
      providerNetwork.name;
    const version = APP_VERSION;
    const name = APP_NAME;
    const commit = APP_COMMIT;
    const branch = APP_BRANCH;

    const { heap_size_limit } = getHeapStatistics();
    const heapLimit = Math.round(heap_size_limit / 1024 / 1024).toString();

    this.buildInfo
      .labels({ version, name, network, heapLimit, commit, branch })
      .inc();
    this.logger.log('Init app', {
      name,
      version,
      commit,
      branch,
      network,
      heapLimit,
    });
  }
}
