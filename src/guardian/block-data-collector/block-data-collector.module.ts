import { Module } from '@nestjs/common';
import { DepositsRegistryModule } from 'contracts/deposits-registry';
import { SecurityModule } from 'contracts/security';
import { StakingModuleGuardModule } from 'guardian/staking-module-guard';
import { WalletModule } from 'wallet';
import { StakingRouterModule } from 'contracts/staking-router';
import { BlockDataCollectorService } from './block-data-collector.service';

@Module({
  imports: [
    DepositsRegistryModule.register(),
    SecurityModule,
    StakingModuleGuardModule,
    WalletModule,
    StakingRouterModule,
  ],
  providers: [BlockDataCollectorService],
  exports: [BlockDataCollectorService],
})
export class BlockDataCollectorModule {}
