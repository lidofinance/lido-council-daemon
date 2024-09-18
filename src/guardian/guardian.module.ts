import { Module } from '@nestjs/common';
import { DepositsRegistryModule } from 'contracts/deposits-registry';
import { SecurityModule } from 'contracts/security';
import { MessagesModule } from 'messages';
import { GuardianService } from './guardian.service';
import { ScheduleModule } from 'common/schedule';
import { BlockDataCollectorModule } from './block-data-collector/block-data-collector.module';
import { StakingModuleGuardModule } from './staking-module-guard';
import { GuardianMessageModule } from './guardian-message';
import { GuardianMetricsModule } from './guardian-metrics';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { SigningKeysRegistryModule } from 'contracts/signing-keys-registry';
import { UnvettingModule } from './unvetting/unvetting.module';
import { StakingModuleDataCollectorModule } from 'staking-module-data-collector';
import { StakingRouterModule } from 'contracts/staking-router';

@Module({
  imports: [
    DepositsRegistryModule.register(),
    SecurityModule,
    MessagesModule,
    StakingModuleDataCollectorModule,
    ScheduleModule,
    BlockDataCollectorModule,
    StakingModuleGuardModule,
    UnvettingModule,
    GuardianMessageModule,
    GuardianMetricsModule,
    KeysApiModule,
    SigningKeysRegistryModule.register(),
    StakingRouterModule,
  ],
  providers: [GuardianService],
  exports: [GuardianService],
})
export class GuardianModule {}
