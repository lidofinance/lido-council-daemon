import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'common/logger';

@Module({
  imports: [LoggerModule],
  providers: [ConfigService],
})
export class ProviderModule {}
