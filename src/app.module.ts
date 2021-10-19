import { Module } from '@nestjs/common';
import { AppService } from 'app.service';

import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PrometheusModule,
    LoggerModule,
    GuardianModule,
  ],
  providers: [AppService],
})
export class AppModule {}
