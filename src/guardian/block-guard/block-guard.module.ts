import { Module } from '@nestjs/common';
import { DepositModule } from 'contracts/deposit';
import { SecurityModule } from 'contracts/security';
import { BlockGuardService } from './block-guard.service';
import { LidoModule } from 'contracts/lido';
import { StakingModuleGuardModule } from 'guardian/staking-module-guard';

@Module({
  imports: [
    LidoModule,
    DepositModule,
    SecurityModule,
    StakingModuleGuardModule,
  ],
  providers: [BlockGuardService],
  exports: [BlockGuardService],
})
export class BlockGuardModule {}
