import { Module } from '@nestjs/common';
import { LidoService } from './lido.service';

@Module({
  providers: [LidoService],
  exports: [LidoService],
})
export class LidoModule {}
