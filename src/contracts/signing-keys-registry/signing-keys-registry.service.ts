import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService } from 'provider';
import { SigningKeyEventsGroupWithStakingModules } from './interfaces/event.interface';
import { SigningKeysStoreService } from './store';
import { SigningKeyEventsCache } from './interfaces/cache.interface';
import {
  EARLIEST_MODULE_DEPLOYMENT_BLOCK_NETWORK,
  FETCHING_EVENTS_STEP,
  SIGNING_KEYS_REGISTRY_FINALIZED_TAG,
} from './signing-keys-registry.constants';
import { performance } from 'perf_hooks';
import { SigningKeysRegistryFetcherService } from './fetcher';
import { SigningKeysRegistrySanityCheckerService } from './sanity-checker/sanity-checker.service';

@Injectable()
export class SigningKeysRegistryService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private store: SigningKeysStoreService,
    private fetcher: SigningKeysRegistryFetcherService,
    private sanityChecker: SigningKeysRegistrySanityCheckerService,
    @Inject(SIGNING_KEYS_REGISTRY_FINALIZED_TAG) private finalizedTag: string,
  ) {}

  /**
   * Handles the logic for processing a new block.
   *
   * This method checks if the staking module list has been updated and, if so, deletes the cache and updates the events cache.
   * If the staking module list has not been updated, it checks whether the block number is divisible by the
   * `SIGNING_KEY_EVENTS_CACHE_UPDATE_BLOCK_RATE` and, if true, updates the events cache.
   *
   * @param {number} blockNumber - The block number of the newly processed block.
   * @returns {Promise<void>}
   */
  public async handleNewBlock(
    currentStakingModulesAddresses: string[],
  ): Promise<void> {
    await this.updateEventsCache(currentStakingModulesAddresses);
  }

  /**
   * Initialize or update cache
   * @param {number} blockNumber - The block number to validate the cache against.
   * @returns {Promise<void>}
   */
  public async initialize(currentStakingModulesAddresses: string[]) {
    await this.store.initialize();
    await this.updateEventsCache(currentStakingModulesAddresses);
  }

  /**
   * Updates the cache signing keys events
   * The last N blocks are not stored, in order to avoid storing reorganized blocks
   *
   * @returns {Promise<number>} The block number up to which the cache has been updated.
   */
  public async updateEventsCache(
    currentStakingModulesAddresses: string[],
  ): Promise<void> {
    const fetchTimeStart = performance.now();

    const wasUpdated = await this.stakingModuleListWasUpdated(
      currentStakingModulesAddresses,
    );

    if (wasUpdated) {
      this.logger.log('Staking module list was updated. Deleting cache');
      await this.store.deleteCache();
    }

    const [finalizedBlock, initialCache] = await Promise.all([
      this.providerService.getBlock(this.finalizedTag),
      this.getCachedEvents(),
    ]);

    const { number: finalizedBlockNumber } = finalizedBlock;
    const firstNotCachedBlock = initialCache.headers.endBlock + 1;

    const totalEventsCount = initialCache.data.length;
    let newEventsCount = 0;

    // check that the cache is written to a block less than or equal to the current block
    // otherwise we consider that the Ethereum node has started sending incorrect data
    const isCacheValid = this.sanityChecker.verifyCacheBlock(
      initialCache,
      finalizedBlockNumber,
    );

    if (!isCacheValid) return;

    for (
      let block = firstNotCachedBlock;
      block <= finalizedBlockNumber;
      block += FETCHING_EVENTS_STEP
    ) {
      const chunkStartBlock = block;
      const chunkToBlock = Math.min(
        finalizedBlockNumber,
        block + FETCHING_EVENTS_STEP - 1,
      );

      const chunkEventGroup = await this.fetcher.fetchEventsFallOver(
        chunkStartBlock,
        chunkToBlock,
        currentStakingModulesAddresses,
      );

      await this.store.insertEventsCacheBatch({
        headers: {
          ...initialCache.headers,
          // as we update staking modules addresses always before run of this method, we can update value on every iteration
          stakingModulesAddresses: currentStakingModulesAddresses,
          endBlock: chunkEventGroup.endBlock,
        },
        data: chunkEventGroup.events,
      });

      newEventsCount += chunkEventGroup.events.length;

      this.logger.log('Historical signing key add events are fetched', {
        finalizedBlockNumber,
        startBlock: chunkStartBlock,
        endBlock: chunkToBlock,
      });
    }

    const fetchTimeEnd = performance.now();
    const fetchTime = Math.ceil(fetchTimeEnd - fetchTimeStart) / 1000;
    // TODO: replace timer with metric

    this.logger.log('Signing key events cache is updated', {
      newEventsCount,
      totalEventsCount: totalEventsCount + newEventsCount,
      fetchTime,
    });
  }

  /**
   * Checks if the list of staking modules has been updated.
   *
   * This method compares the current list of staking modules with the previously cached list.
   * If the list has changed, it logs a warning and indicates that the cache needs to be cleared and updated.
   *
   * @returns {Promise<boolean>} Return `true` if the staking modules list was updated, `false` otherwise.
   */
  public async stakingModuleListWasUpdated(
    currentModules: string[],
  ): Promise<boolean> {
    const {
      headers: { stakingModulesAddresses: previousModules },
    } = await this.store.getHeader();

    const wasUpdated = this.wasStakingModulesListUpdated(
      previousModules,
      currentModules,
    );

    if (wasUpdated) {
      this.logger.warn(
        'Staking module list was changed. Need to clear and update cache',
        {
          previousModules,
          currentModules,
        },
      );
    }

    return wasUpdated;
  }

  /**
   * Compares the previous and current lists of staking modules to determine if any changes have occurred.
   *
   * This method checks if any staking modules were added or deleted by comparing the previous
   * and current lists of staking modules.
   *
   * @param {string[]} previousModules - The list of staking modules from the previous cache.
   * @param {string[]} currentModules - The current list of staking modules.
   * @returns {boolean} `true` if the staking modules list was updated (modules were added or deleted), `false` otherwise.
   */
  public wasStakingModulesListUpdated(
    previousModules: string[],
    currentModules: string[],
  ) {
    const modulesWereDeleted = previousModules.some(
      (sm) => !currentModules.includes(sm),
    );
    const modulesWereAdded = currentModules.some(
      (module) => !previousModules.includes(module),
    );

    return modulesWereDeleted || modulesWereAdded;
  }

  /**
   * Retrieves signing key events data from the cache.
   *
   * This method fetches cached signing key events along with their associated headers.
   * If the headers have default values (like 0 for the start and end block numbers),
   * these values are updated to reflect the actual deployment block of the network.
   *
   * @returns {Promise<SigningKeyEventsCache>} A promise that resolves to a `SigningKeyEventsCache` object,
   * containing the cached signing key events and their metadata.
   */
  public async getCachedEvents(): Promise<SigningKeyEventsCache> {
    const { headers, data } = await this.store.getEventsCache();

    // default values is startBlock: 0, endBlock: 0
    const deploymentBlock = await this.getDeploymentBlockByNetwork();

    return {
      headers: {
        ...headers,
        startBlock: Math.max(headers.startBlock, deploymentBlock),
        endBlock: Math.max(headers.endBlock, deploymentBlock),
      },
      data,
    };
  }

  /**
   * Retrieves signing key events from the cache for the specified operators' keys.
   *
   * This method takes a list of operators' keys, ensures the list contains unique keys,
   * and then fetches the corresponding events from the cache.
   *
   * @param {string[]} keys - An array of operators' keys for which to retrieve events.
   * @returns {Promise<SigningKeyEventsCache>} Events associated with the specified keys.
   */
  public async getEventsForOperatorsKeys(
    keys: string[],
  ): Promise<SigningKeyEventsCache> {
    const uniqueKeys = Array.from(new Set(keys));
    return await this.store.getCachedEvents(uniqueKeys);
  }

  /**
   * Retrieves and returns all signing key events based on cached data and fresh data for a given key.
   *
   * This method combines cached signing key events with newly fetched events for a specific key,
   * ensuring the cache is valid and updating the cache if necessary.
   *
   * @param {string} key - The specific signing key to retrieve events for.
   * @param {number} blockNumber - The block number up to which the events should be retrieved.
   * @param {string} blockHash - The block hash used to verify the integrity of the retrieved events.
   * @returns {Promise<SigningKeyEventsGroupWithStakingModules>} merged signing key events and associated staking module addresses.
   */
  public async getUpdatedSigningKeyEvents(
    key: string,
    blockNumber: number,
    blockHash: string,
  ): Promise<SigningKeyEventsGroupWithStakingModules> {
    const endBlock = blockNumber;
    const cachedEvents = await this.getEventsForOperatorsKeys([key]);

    const isCacheValid = this.sanityChecker.verifyCacheBlock(
      cachedEvents,
      blockNumber,
    );

    if (!isCacheValid) {
      throw new Error(
        `Signing key events cache is newer than the current block: ${blockNumber}`,
      );
    }

    const firstNotCachedBlock = cachedEvents.headers.endBlock + 1;

    const freshEventGroup = await this.fetcher.fetchEventsFallOver(
      firstNotCachedBlock,
      endBlock,
      cachedEvents.headers.stakingModulesAddresses,
    );
    const freshEvents = freshEventGroup.events;
    const lastEvent = freshEvents[freshEvents.length - 1];
    const lastEventBlockHash = lastEvent?.blockHash;

    const isValid = this.sanityChecker.checkEventsBlockHash(
      freshEvents,
      blockNumber,
      blockHash,
    );

    if (!isValid) {
      throw new Error(`Reorganization found on block ${blockNumber}`);
    }

    this.logger.debug?.('Fresh signing key add events are fetched', {
      events: freshEvents.length,
      startBlock: firstNotCachedBlock,
      endBlock,
      blockHash,
      lastEventBlockHash,
    });

    const keyFreshEvents = freshEventGroup.events.filter(
      (event) => event.key == key,
    );

    const mergedEvents = cachedEvents.data.concat(keyFreshEvents);

    this.logger.debug?.('Merged signing key add events', {
      events: mergedEvents.length,
      startBlock: firstNotCachedBlock,
      endBlock,
      blockHash,
      lastEventBlockHash,
    });

    return {
      events: mergedEvents,
      stakingModulesAddresses: cachedEvents.headers.stakingModulesAddresses,
      startBlock: cachedEvents.headers.startBlock,
      endBlock,
    };
  }

  /**
   * Saves signing key events to the cache.
   *
   * This method first deletes the existing cache and then saves the provided signing key events
   * and their associated headers to the cache.
   *
   * @param {SigningKeyEventsCache} cachedEvents - An object containing the signing key events and headers to be saved to the cache.
   * @returns {Promise<void>}
   */
  public async setCachedEvents(
    cachedEvents: SigningKeyEventsCache,
  ): Promise<void> {
    await this.store.deleteCache();
    await this.store.insertEventsCacheBatch({
      data: cachedEvents.data,
      headers: cachedEvents.headers,
    });
  }

  /**
   * Retrieves the block number when the curated module contract was deployed for the current network.
   *
   * This method determines the deployment block number based on the current network's chain ID.
   * If the chain ID is not supported, an error is thrown.
   *
   * @returns {Promise<number>} Block number where the curated module contract was deployed.
   * @throws {Error} If the chain ID is not supported.
   */
  public async getDeploymentBlockByNetwork(): Promise<number> {
    const chainId = await this.providerService.getChainId();

    const block = EARLIEST_MODULE_DEPLOYMENT_BLOCK_NETWORK[chainId];
    if (block == null) throw new Error(`Chain ${chainId} is not supported`);

    return block;
  }
}
