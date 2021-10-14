import { Module } from '@nestjs/common';

import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { DefenderModule } from 'defender';
import { TransportModule } from 'transport';

@Module({
  imports: [
    ConfigModule.forRoot(),
    LoggerModule,
    DefenderModule,
    TransportModule,
  ],
})
export class AppModule {}
