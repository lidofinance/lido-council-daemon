import { Module } from '@nestjs/common';
import { AppService } from 'app.service';

import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';
import { MainProviderModule } from 'provider/main-provider.module';
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
  ],
  providers: [AppService],
})
export class AppModule {}
