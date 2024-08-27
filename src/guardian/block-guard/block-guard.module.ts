import { Module } from '@nestjs/common';
import { DepositModule } from 'contracts/deposit';
import { SecurityModule } from 'contracts/security';
import { BlockGuardService } from './block-guard.service';
import { StakingModuleGuardModule } from 'guardian/staking-module-guard';
import { WalletModule } from 'wallet';
import { StakingRouterModule } from 'contracts/staking-router';

@Module({
  imports: [
    DepositModule,
    SecurityModule,
    StakingModuleGuardModule,
    WalletModule,
    StakingRouterModule,
  ],
  providers: [BlockGuardService],
  exports: [BlockGuardService],
})
export class BlockGuardModule {}
