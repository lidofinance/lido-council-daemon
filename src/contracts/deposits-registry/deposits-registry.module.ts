import { DynamicModule, Module } from '@nestjs/common';
import { SecurityModule } from 'contracts/security';
import { DepositsRegistryStoreModule } from './store';
import { DepositRegistryService } from './deposits-registry.service';
import {
  DEPOSIT_CACHE_DEFAULT,
  DEPOSIT_REGISTRY_FINALIZED_TAG,
} from './deposits-registry.constants';
import { DepositsRegistryFetcherModule } from './fetcher';
import { DepositRegistrySanityCheckerModule } from './sanity-checker';

@Module({})
export class DepositsRegistryModule {
  /**
   * Registers the deposits module with a specific tag to handle block finality.
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
      module: DepositsRegistryModule,
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
          useValue: finalizedTag,
        },
      ],
      exports: [DepositRegistryService],
    };
  }
}
