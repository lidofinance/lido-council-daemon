import { DynamicModule, Module } from '@nestjs/common';
import { SigningKeysStoreModule } from './store';
import { SigningKeysRegistryService } from './signing-keys-registry.service';
import {
  SIGNING_KEYS_CACHE_DEFAULT,
  SIGNING_KEYS_REGISTRY_FINALIZED_TAG,
} from './signing-keys-registry.constants';
import { SigningKeysRegistryFetcherModule } from './fetcher';
import { SigningKeysRegistrySanityCheckerModule } from './sanity-checker';

@Module({})
export class SigningKeysRegistryModule {
  /**
   * Registers the signing keys module with a specific tag to handle block finality.
   * The `finalizedTag` is primarily used to address issues with the Ganache handling of the 'finalized' tag,
   * where it needs to be substituted with 'latest' for end-to-end tests. This tag is necessary only on a Ethereum node
   * to avoid issues with blockchain reorganizations.
   * In a production environment, this argument should either be empty or set to 'finalized'.
   *
   * @param {string} [finalizedTag='finalized'] - The tag to be used for identifying the status of blocks concerning finality.
   * @returns {DynamicModule} - The dynamic module configuration for the Deposits Registry.
   */
  static register(finalizedTag = 'finalized'): DynamicModule {
    return {
      module: SigningKeysRegistryModule,
      imports: [
        SigningKeysRegistryFetcherModule,
        SigningKeysRegistrySanityCheckerModule,
        SigningKeysStoreModule.register(SIGNING_KEYS_CACHE_DEFAULT),
      ],
      providers: [
        SigningKeysRegistryService,
        {
          provide: SIGNING_KEYS_REGISTRY_FINALIZED_TAG,
          useValue: finalizedTag,
        },
      ],
      exports: [SigningKeysRegistryService],
    };
  }
}
