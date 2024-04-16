import { Module } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { StakingRouterService } from './staking-router.service';
import { SecurityModule } from 'contracts/security';

@Module({
  imports: [ConfigModule, KeysApiModule, SecurityModule],
  providers: [StakingRouterService],
  exports: [StakingRouterService],
})
export class StakingRouterModule {}
