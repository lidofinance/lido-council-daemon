import { Module } from '@nestjs/common';
import { LoggerModule } from 'common/logger';
import { DepositModule } from 'deposit';
import { LidoModule } from 'lido';
import { ProviderModule } from 'provider';
import { RegistryModule } from 'registry';
import { DefenderService } from './defender.service';

@Module({
  imports: [
    LoggerModule,
    RegistryModule,
    DepositModule,
    LidoModule,
    ProviderModule,
  ],
  providers: [DefenderService],
  exports: [DefenderService],
})
export class DefenderModule {}
