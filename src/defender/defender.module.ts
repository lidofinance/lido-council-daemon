import { Module } from '@nestjs/common';
import { DepositModule } from 'deposit';
import { ProviderModule } from 'provider';
import { RegistryModule } from 'registry';
import { SecurityModule } from 'security';
import { TransportModule } from 'transport';
import { DefenderService } from './defender.service';

@Module({
  imports: [
    RegistryModule,
    DepositModule,
    SecurityModule,
    ProviderModule,
    TransportModule,
  ],
  providers: [DefenderService],
  exports: [DefenderService],
})
export class DefenderModule {}
