import { Module } from '@nestjs/common';
import { StakingRouterModule } from 'contracts/staking-router';
import { SigningKeysRegistryFetcherService } from './fetcher.service';

@Module({
  imports: [StakingRouterModule],
  providers: [SigningKeysRegistryFetcherService],
  exports: [SigningKeysRegistryFetcherService],
})
export class SigningKeysRegistryFetcherModule {}
