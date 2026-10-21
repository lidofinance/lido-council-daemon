import { Module } from '@nestjs/common';
import { SigningKeysStoreModule } from './store';
import { SigningKeysRegistryService } from './signing-keys-registry.service';
import {
  SIGNING_KEYS_CACHE_DEFAULT,
  SIGNING_KEYS_REGISTRY_FINALIZED_TAG,
} from './signing-keys-registry.constants';
import { SigningKeysRegistryFetcherModule } from './fetcher';
import { SigningKeysRegistrySanityCheckerModule } from './sanity-checker';

@Module({
  imports: [
    SigningKeysRegistryFetcherModule,
    SigningKeysRegistrySanityCheckerModule,
    SigningKeysStoreModule.register(SIGNING_KEYS_CACHE_DEFAULT),
  ],
  providers: [
    SigningKeysRegistryService,
    {
      provide: SIGNING_KEYS_REGISTRY_FINALIZED_TAG,
      useValue: 'finalized',
    },
  ],
  exports: [SigningKeysRegistryService],
})
export class SigningKeysRegistryModule {}
