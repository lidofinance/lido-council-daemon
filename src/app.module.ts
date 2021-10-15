import { Module } from '@nestjs/common';

import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { GuardianModule } from 'guardian';
import { TransportModule } from 'transport';

@Module({
  imports: [
    ConfigModule.forRoot(),
    LoggerModule,
    GuardianModule,
    TransportModule,
  ],
})
export class AppModule {}
