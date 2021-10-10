import { Module } from '@nestjs/common';
import { DepositModule } from 'deposit';
import { LidoModule } from 'lido';
import { ProviderModule } from 'provider';
import { RegistryModule } from 'registry';
import { TransportModule } from 'transport';
import { DefenderService } from './defender.service';

@Module({
  imports: [
    RegistryModule,
    DepositModule,
    LidoModule,
    ProviderModule,
    TransportModule,
  ],
  providers: [DefenderService],
  exports: [DefenderService],
})
export class DefenderModule {}
