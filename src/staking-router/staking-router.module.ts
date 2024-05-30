import { Module } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { StakingRouterService } from './staking-router.service';
import { SecurityModule } from 'contracts/security';
import { StakingModuleGuardModule } from 'guardian/staking-module-guard';

@Module({
  imports: [ConfigModule, SecurityModule, StakingModuleGuardModule],
  providers: [StakingRouterService],
  exports: [StakingRouterService],
})
export class StakingRouterModule {}
