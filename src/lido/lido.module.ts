import { Module } from '@nestjs/common';
import { LoggerModule } from 'common/logger';
import { ProviderModule } from 'provider';
import { LidoService } from './lido.service';

@Module({
  imports: [LoggerModule, ProviderModule],
  providers: [LidoService],
  exports: [LidoService],
})
export class LidoModule {}
