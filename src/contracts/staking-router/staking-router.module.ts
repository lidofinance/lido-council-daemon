import { Module } from '@nestjs/common';
import { StakingRouterService } from './staking-router.service';

@Module({
  providers: [StakingRouterService],
  exports: [StakingRouterService],
})
export class StakingRouterModule {}
