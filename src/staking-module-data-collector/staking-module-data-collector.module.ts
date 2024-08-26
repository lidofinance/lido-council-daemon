import { Module } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { StakingModuleDataCollectorService } from './staking-module-data-collector.service';
import { SecurityModule } from 'contracts/security';
import { StakingModuleGuardModule } from 'guardian/staking-module-guard';
import { KeysDuplicationCheckerModule } from 'guardian/duplicates';
import { GuardianMetricsModule } from 'guardian/guardian-metrics';

@Module({
  imports: [
    ConfigModule,
    SecurityModule,
    StakingModuleGuardModule,
    KeysDuplicationCheckerModule,
    GuardianMetricsModule,
  ],
  providers: [StakingModuleDataCollectorService],
  exports: [StakingModuleDataCollectorService],
})
export class StakingModuleDataCollectorModule {}