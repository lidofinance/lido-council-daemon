import { Module } from '@nestjs/common';
import { BlsModule } from 'bls';
import { DepositsRegistryFetcherService } from './fetcher.service';

@Module({
  imports: [BlsModule],
  providers: [DepositsRegistryFetcherService],
  exports: [DepositsRegistryFetcherService],
})
export class DepositsRegistryFetcherModule {}
