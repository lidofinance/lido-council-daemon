import { Module } from '@nestjs/common';
import { SigningKeysStoreModule } from './store';
import { SigningKeysRegistryService } from './signing-keys-registry.service';
import { SIGNING_KEYS_CACHE_DEFAULT } from './constants';
import { StakingRouterModule } from 'contracts/staking-router';

@Module({
  imports: [
    StakingRouterModule,
    SigningKeysStoreModule.register(SIGNING_KEYS_CACHE_DEFAULT),
  ],
  providers: [SigningKeysRegistryService],
  exports: [SigningKeysRegistryService],
})
export class SigningKeysRegistryModule {}
