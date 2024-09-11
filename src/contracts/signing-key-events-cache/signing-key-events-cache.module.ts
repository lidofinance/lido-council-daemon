import { Module } from '@nestjs/common';
import { LevelDBModule } from './leveldb';
import { SigningKeyEventsCacheService } from './signing-key-events-cache.service';
import { SIGNING_KEYS_CACHE_DEFAULT } from './constants';
import { StakingRouterModule } from 'contracts/staking-router';

@Module({
  imports: [
    StakingRouterModule,
    LevelDBModule.register(SIGNING_KEYS_CACHE_DEFAULT),
  ],
  providers: [SigningKeyEventsCacheService],
  exports: [SigningKeyEventsCacheService],
})
export class SigningKeyEventsCacheModule {}
