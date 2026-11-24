import { Inject, LoggerService, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { getMetadataStorage } from 'class-validator';
import { BigNumber } from 'ethers';
import {
  APP_BRANCH,
  APP_COMMIT,
  APP_NAME,
  APP_VERSION,
  assertVersionFitsBytes32,
} from 'app.constants';
import { Configuration } from 'common/config';
import { InMemoryConfiguration } from 'common/config/in-memory-configuration';
import { METRIC_BUILD_INFO } from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Gauge } from '@prometheus-io/client';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { CHAINS } from '@lido-nestjs/constants';
import { getHeapStatistics } from 'v8';

/**
 * Every config field with its value. The field names come from the
 * validation metadata: the config instance also holds every process env
 * variable, and fields without an initializer have no own property.
 */
export const dumpConfig = (config: Configuration): Record<string, unknown> => {
  const names = getMetadataStorage()
    .getTargetValidationMetadatas(InMemoryConfiguration, '', false, false)
    .map((metadata) => metadata.propertyName);

  return Object.fromEntries(
    [...new Set(names)].sort().map((name) => {
      const value = config[name];
      return [name, BigNumber.isBigNumber(value) ? value.toString() : value];
    }),
  );
};

export class AppService implements OnModuleInit {
  constructor(
    private provider: SimpleFallbackJsonRpcBatchProvider,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @InjectMetric(METRIC_BUILD_INFO) private buildInfo: Gauge<string>,
    private config: Configuration,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Config', dumpConfig(this.config));
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
