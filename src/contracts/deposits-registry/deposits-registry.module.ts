import { Module } from '@nestjs/common';
import { SecurityModule } from 'contracts/security';
import { DepositsRegistryStoreModule } from './store';
import { DepositRegistryService } from './deposits-registry.service';
import {
  DEPOSIT_CACHE_DEFAULT,
  DEPOSIT_REGISTRY_FINALIZED_TAG,
} from './deposits-registry.constants';
import { DepositsRegistryFetcherModule } from './fetcher';
import { DepositRegistrySanityCheckerModule } from './sanity-checker';

@Module({
  imports: [
    SecurityModule,
    DepositsRegistryFetcherModule,
    DepositRegistrySanityCheckerModule,
    DepositsRegistryStoreModule.register(DEPOSIT_CACHE_DEFAULT),
  ],
  providers: [
    DepositRegistryService,
    {
      provide: DEPOSIT_REGISTRY_FINALIZED_TAG,
      useValue: 'finalized',
    },
  ],
  exports: [DepositRegistryService],
})
export class DepositsRegistryModule {}
