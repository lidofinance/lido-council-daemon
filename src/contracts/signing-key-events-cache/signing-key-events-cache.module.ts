import { Module } from '@nestjs/common';
import { LevelDBModule } from './leveldb';
import { SigningKeyEventsCacheService } from './signing-key-events-cache.service';
import { SIGNING_KEYS_CACHE_DEFAULT } from './constants';
import { RepositoryModule } from 'contracts/repository';

@Module({
  imports: [
    RepositoryModule,
    LevelDBModule.register(SIGNING_KEYS_CACHE_DEFAULT),
  ],
  providers: [SigningKeyEventsCacheService],
  exports: [SigningKeyEventsCacheService],
})
export class SigningKeyEventsCacheModule {}
