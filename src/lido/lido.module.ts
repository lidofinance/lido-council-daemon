import { Module } from '@nestjs/common';
import { ProviderModule } from 'provider';
import { LidoService } from './lido.service';

@Module({
  imports: [ProviderModule],
  providers: [LidoService],
  exports: [LidoService],
})
export class LidoModule {}
