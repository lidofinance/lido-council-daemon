import { Inject, LoggerService, Module, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { APP_NAME, APP_VERSION } from 'app.constants';
import { execSync } from 'child_process';

import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { METRIC_BUILD_INFO, PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Gauge } from 'prom-client';
import { WalletModule } from 'wallet';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PrometheusModule,
    LoggerModule,
    GuardianModule,
    WalletModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @InjectMetric(METRIC_BUILD_INFO) private buildInfo: Gauge<string>,
  ) {}

  getLastCommit() {
    try {
      return execSync('git rev-parse HEAD').toString().trim();
    } catch (error) {
      return null;
    }
  }

  getBranchName() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    } catch (error) {
      return null;
    }
  }

  onModuleInit() {
    const version = APP_VERSION;
    const name = APP_NAME;
    const branch = this.getBranchName() ?? '';
    const commit = this.getLastCommit() ?? '';

    this.buildInfo.labels({ version, name, branch, commit }).inc();
    this.logger.log('Init app', { name, version, branch, commit });
  }
}
