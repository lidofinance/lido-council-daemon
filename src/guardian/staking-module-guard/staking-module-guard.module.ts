import { Module } from '@nestjs/common';

import { SecurityModule } from 'contracts/security';
import { LidoModule } from 'contracts/lido';
import { StakingRouterModule } from 'staking-router';

import { GuardianMetricsModule } from '../guardian-metrics';
import { GuardianMessageModule } from '../guardian-message';

import { StakingModuleGuardService } from './staking-module-guard.service';

@Module({
  imports: [
    SecurityModule,
    LidoModule,
    StakingRouterModule,
    GuardianMetricsModule,
    // GuardianMessageModule,
  ],
  providers: [StakingModuleGuardService],
  exports: [StakingModuleGuardService],
})
export class StakingModuleGuardModule {}
