import { Module } from '@nestjs/common';
import { DepositsRegistryModule } from 'contracts/deposits-registry';
import { SecurityModule } from 'contracts/security';
import { BlockGuardService } from './block-guard.service';
import { LidoModule } from 'contracts/lido';
import { StakingModuleGuardModule } from 'guardian/staking-module-guard';
import { WalletModule } from 'wallet';

@Module({
  imports: [
    LidoModule,
    DepositsRegistryModule,
    SecurityModule,
    StakingModuleGuardModule,
    WalletModule,
  ],
  providers: [BlockGuardService],
  exports: [BlockGuardService],
})
export class BlockGuardModule {}
