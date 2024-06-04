import { Module } from '@nestjs/common';
import { DepositModule } from 'contracts/deposit';
import { SecurityModule } from 'contracts/security';
import { LidoModule } from 'contracts/lido';
import { MessagesModule } from 'messages';
import { GuardianService } from './guardian.service';
import { StakingRouterModule } from 'staking-router';
import { ScheduleModule } from 'common/schedule';
import { BlockGuardModule } from './block-guard/block-guard.module';
import { StakingModuleGuardModule } from './staking-module-guard';
import { GuardianMessageModule } from './guardian-message';
import { GuardianMetricsModule } from './guardian-metrics';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { SigningKeyEventsCacheModule } from 'contracts/signing-key-events-cache';

@Module({
  imports: [
    DepositModule,
    SecurityModule,
    LidoModule,
    MessagesModule,
    StakingRouterModule,
    ScheduleModule,
    BlockGuardModule,
    StakingModuleGuardModule,
    GuardianMessageModule,
    GuardianMetricsModule,
    KeysApiModule,
    SigningKeyEventsCacheModule,
  ],
  providers: [GuardianService],
  exports: [GuardianService],
})
export class GuardianModule {}
