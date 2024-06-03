import { Module } from '@nestjs/common';

import { SecurityModule } from 'contracts/security';

import { GuardianMetricsModule } from '../guardian-metrics';
import { GuardianMessageModule } from '../guardian-message';

import { StakingModuleGuardService } from './staking-module-guard.service';
import { KeysValidationModule } from 'guardian/keys-validation/keys-validation.module';
import { UnvettingModule } from 'guardian/unvetting/unvetting.module';
import { KeysApiModule } from 'keys-api/keys-api.module';

@Module({
  imports: [
    SecurityModule,
    GuardianMetricsModule,
    GuardianMessageModule,
    KeysValidationModule,
    UnvettingModule,
    KeysApiModule,
  ],
  providers: [StakingModuleGuardService],
  exports: [StakingModuleGuardService],
})
export class StakingModuleGuardModule {}
