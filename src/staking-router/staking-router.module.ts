import { Module } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { StakingRouterService } from './staking-router.service';

@Module({
  imports: [ConfigModule, KeysApiModule],
  providers: [StakingRouterService],
  exports: [StakingRouterService],
})
export class StakingRouterModule {}
