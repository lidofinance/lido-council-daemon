import { Module } from '@nestjs/common';
import { AppService } from 'app.service';

import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';
import { WalletModule } from 'wallet';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PrometheusModule,
    LoggerModule,
    GuardianModule,
    WalletModule,
  ],
  providers: [AppService],
})
export class AppModule {}
