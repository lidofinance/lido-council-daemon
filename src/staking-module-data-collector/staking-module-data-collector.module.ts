import { Module } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { StakingModuleDataCollectorService } from './staking-module-data-collector.service';
import { StakingModuleGuardModule } from 'guardian/staking-module-guard';
import { KeysDuplicationCheckerModule } from 'guardian/duplicates';
import { GuardianMetricsModule } from 'guardian/guardian-metrics';
import { StakingRouterModule } from 'contracts/staking-router';

@Module({
  imports: [
    ConfigModule,
    StakingModuleGuardModule,
    KeysDuplicationCheckerModule,
    GuardianMetricsModule,
    StakingRouterModule,
  ],
  providers: [StakingModuleDataCollectorService],
  exports: [StakingModuleDataCollectorService],
})
export class StakingModuleDataCollectorModule {}
