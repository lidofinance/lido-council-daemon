import { Module } from '@nestjs/common';
import { SecurityModule } from 'contracts/security';
import { DepositsRegistryStoreModule } from './store';
import { DepositRegistryService } from './deposits-registry.service';
import { DEPOSIT_CACHE_DEFAULT } from './deposit-registry.constants';
import { DepositsRegistryFetcherModule } from './fetcher';

@Module({
  imports: [
    SecurityModule,
    DepositsRegistryFetcherModule,
    DepositsRegistryStoreModule.register(DEPOSIT_CACHE_DEFAULT),
  ],
  providers: [DepositRegistryService],
  exports: [DepositRegistryService],
})
export class DepositModule {}
