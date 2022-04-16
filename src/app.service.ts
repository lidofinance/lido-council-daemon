import { Inject, LoggerService, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { APP_NAME, APP_VERSION } from 'app.constants';
import { METRIC_BUILD_INFO } from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Gauge } from 'prom-client';
import { ProviderService } from 'provider';

export class AppService implements OnModuleInit {
  constructor(
    private providerService: ProviderService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @InjectMetric(METRIC_BUILD_INFO) private buildInfo: Gauge<string>,
  ) {}

  async onModuleInit(): Promise<void> {
    const network = await this.providerService.getNetworkName();
    const version = APP_VERSION;
    const name = APP_NAME;

    this.buildInfo.labels({ version, name, network }).inc();
    this.logger.log('Init app', { name, version });
  }
}
