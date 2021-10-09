import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'common/logger';
import { ProviderService } from 'provider';
import { LidoService } from './lido.service';

@Module({
  imports: [LoggerModule],
  providers: [LidoService, ConfigService, ProviderService],
})
export class LidoModule {}
