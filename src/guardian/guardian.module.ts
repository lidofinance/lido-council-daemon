import { Module } from '@nestjs/common';
import { DepositModule } from 'contracts/deposit';
import { SecurityModule } from 'contracts/security';
import { LidoModule } from 'contracts/lido';
import { MessagesModule } from 'messages';
import { GuardianService } from './guardian.service';
import { StakingRouterModule } from 'staking-router';
import { ScheduleModule } from 'common/schedule';

@Module({
  imports: [
    DepositModule,
    SecurityModule,
    LidoModule,
    MessagesModule,
    StakingRouterModule,
    ScheduleModule,
  ],
  providers: [GuardianService],
  exports: [GuardianService],
})
export class GuardianModule {}
