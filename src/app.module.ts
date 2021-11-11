import { Module } from '@nestjs/common';
import { AppService } from 'app.service';

import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';
import { ProviderModule } from 'provider';
import { HealthModule } from 'health';

@Module({
  imports: [
    ProviderModule.forRoot(),
    ConfigModule.forRoot(),
    PrometheusModule,
    LoggerModule,
    GuardianModule,
    HealthModule,
  ],
  providers: [AppService],
})
export class AppModule {}
