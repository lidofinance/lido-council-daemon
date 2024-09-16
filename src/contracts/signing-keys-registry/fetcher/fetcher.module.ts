import { Module } from '@nestjs/common';
import { BlsModule } from 'bls';
import { SigningKeysRegistryFetcherService } from './fetcher.service';

@Module({
  imports: [BlsModule],
  providers: [SigningKeysRegistryFetcherService],
  exports: [SigningKeysRegistryFetcherService],
})
export class SigningKeysRegistryFetcherModule {}
