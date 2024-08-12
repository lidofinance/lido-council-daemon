import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { RepositoryService } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService } from 'provider';
import {
  SigningKeyEvent,
  SigningKeyEventsGroup,
  SigningKeyEventsGroupWithStakingModules,
} from './interfaces/event.interface';
import { LevelDBService } from './leveldb';
import { SigningKeyEventsCache } from './interfaces/cache.interface';
import {
  CURATED_MODULE_DEPLOYMENT_BLOCK_NETWORK,
  FETCHING_EVENTS_STEP,
  SIGNING_KEYS_EVENTS_CACHE_LAG_BLOCKS,
  SIGNING_KEY_EVENTS_CACHE_UPDATE_BLOCK_RATE,
} from './constants';
import { performance } from 'perf_hooks';

@Injectable()
export class SigningKeyEventsCacheService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private repositoryService: RepositoryService,
    private levelDBCacheService: LevelDBService,
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
  public async handleNewBlock(blockNumber): Promise<void> {
    const wasUpdated = await this.stakingModuleListWasUpdated();
    if (wasUpdated) {
      this.logger.log('Staking module list was updated. Deleting cache');
      await this.levelDBCacheService.deleteCache();
      await this.updateEventsCache();
    } else if (blockNumber % SIGNING_KEY_EVENTS_CACHE_UPDATE_BLOCK_RATE === 0) {
      // update for every SIGNING_KEY_EVENTS_CACHE_UPDATE_BLOCK_RATE block
      await this.updateEventsCache();
    }
  }

  /**
   * Initialize or update cache
   * @param {number} blockNumber - The block number to validate the cache against.
   * @returns {Promise<void>}
   */
  public async initialize(blockNumber) {
    await this.levelDBCacheService.initialize();

    const cachedEvents = await this.getCachedEvents();

    // check age of cache
    const isCacheValid = this.validateCacheBlock(cachedEvents, blockNumber);

    if (!isCacheValid) {
      process.exit(1);
    }

    const wasUpdated = await this.stakingModuleListWasUpdated();
    if (wasUpdated) {
      this.logger.log('Staking module list was updated. Deleting cache');
      await this.levelDBCacheService.deleteCache();
    }

    await this.updateEventsCache();
  }

  /**
   * Updates the cache signing keys events
   * The last N blocks are not stored, in order to avoid storing reorganized blocks
   *
   * @returns {Promise<number>} The block number up to which the cache has been updated.
   */
  public async updateEventsCache(): Promise<number> {
    const fetchTimeStart = performance.now();

    const [latestBlock, initialCache] = await Promise.all([
      this.providerService.getBlockNumber(),
      this.getCachedEvents(),
    ]);

    const firstNotCachedBlock = initialCache.headers.endBlock + 1;
    const toBlock = latestBlock - SIGNING_KEYS_EVENTS_CACHE_LAG_BLOCKS;

    const totalEventsCount = initialCache.data.length;
    let newEventsCount = 0;

    const stakingModulesAddresses = await this.getStakingModules();

    for (
      let block = firstNotCachedBlock;
      block <= toBlock;
      block += FETCHING_EVENTS_STEP
    ) {
      const chunkStartBlock = block;
      const chunkToBlock = Math.min(toBlock, block + FETCHING_EVENTS_STEP - 1);

      const chunkEventGroup = await this.fetchEventsFallOver(
        chunkStartBlock,
        chunkToBlock,
      );

      await this.levelDBCacheService.insertEventsCacheBatch({
        headers: {
          ...initialCache.headers,
          // as we update staking modules addresses always before run of this method, we can update value on every iteration
          stakingModulesAddresses: stakingModulesAddresses,
          endBlock: chunkEventGroup.endBlock,
        },
        data: chunkEventGroup.events,
      });

      newEventsCount += chunkEventGroup.events.length;

      this.logger.log('Historical signing key add events are fetched', {
        toBlock,
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

    return toBlock;
  }

  /**
   * Checks if the list of staking modules has been updated.
   *
   * This method compares the current list of staking modules with the previously cached list.
   * If the list has changed, it logs a warning and indicates that the cache needs to be cleared and updated.
   *
   * @returns {Promise<boolean>} Return `true` if the staking modules list was updated, `false` otherwise.
   */
  public async stakingModuleListWasUpdated(): Promise<boolean> {
    const {
      headers: { stakingModulesAddresses: previousModules },
    } = await this.levelDBCacheService.getHeader();

    const currentModules = await this.getStakingModules();

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
   * Retrieves the list of staking module addresses.
   *
   * This method fetches the cached staking modules contracts and returns the list of staking module addresses.
   *
   * @returns {Promise<string[]>} Array of staking module addresses.
   */
  public async getStakingModules(): Promise<string[]> {
    const stakingModulesContracts =
      await this.repositoryService.getCachedStakingModulesContracts();

    return Object.keys(stakingModulesContracts);
  }

  /**
   * Fetches signing key events within a specified block range, with fallback mechanisms.
   * If the request failed, it tries to repeat it or split it into two
   *
   * @param {number} startBlock - The starting block number of the range.
   * @param {number} endBlock - The ending block number of the range.
   * @returns {Promise<SigningKeyEventsGroup>} Events fetched within the specified block range
   */
  public async fetchEventsFallOver(
    startBlock: number,
    endBlock: number,
  ): Promise<SigningKeyEventsGroup> {
    return await this.providerService.fetchEventsFallOver(
      startBlock,
      endBlock,
      this.fetchEvents.bind(this),
    );
  }

  /**
   * Fetches signing key events within a specified block range from staking module contracts.
   *
   * @param {number} startBlock - The starting block number of the range.
   * @param {number} endBlock - The ending block number of the range.
   * @returns {Promise<SigningKeyEventsGroup>} Events fetched within the specified block range.
   */
  public async fetchEvents(
    startBlock: number,
    endBlock: number,
  ): Promise<SigningKeyEventsGroup> {
    const stakingModulesContracts =
      await this.repositoryService.getCachedStakingModulesContracts();

    const events: SigningKeyEvent[] = [];

    await Promise.all(
      Object.entries(stakingModulesContracts).map(
        async ([address, { impl }]) => {
          const filter = impl.filters['SigningKeyAdded(uint256,bytes)']();

          const rawEvents = await impl.queryFilter(
            filter,
            startBlock,
            endBlock,
          );

          const moduleEvents: SigningKeyEvent[] = rawEvents.map((rawEvent) => {
            return {
              operatorIndex: rawEvent.args[0].toNumber(),
              key: rawEvent.args[1],
              moduleAddress: address,
              blockNumber: rawEvent.blockNumber,
              logIndex: rawEvent.logIndex,
              blockHash: rawEvent.blockHash,
            };
          });

          events.push(...moduleEvents);

          this.logger.log(
            'Fetched signing keys add events for staking module',
            {
              count: moduleEvents.length,
              address,
            },
          );
        },
      ),
    );

    return { events, startBlock, endBlock };
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
    const { headers, data } = await this.levelDBCacheService.getEventsCache();

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
    return await this.levelDBCacheService.getCachedEvents(uniqueKeys);
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

    const isCacheValid = this.validateCacheBlock(cachedEvents, blockNumber);
    if (!isCacheValid) process.exit(1);

    const firstNotCachedBlock = cachedEvents.headers.endBlock + 1;

    const freshEventGroup = await this.fetchEventsFallOver(
      firstNotCachedBlock,
      endBlock,
    );
    const freshEvents = freshEventGroup.events;
    const lastEvent = freshEvents[freshEvents.length - 1];
    const lastEventBlockHash = lastEvent?.blockHash;

    this.checkEventsBlockHash(freshEvents, blockNumber, blockHash);

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
    await this.levelDBCacheService.deleteCache();
    await this.levelDBCacheService.insertEventsCacheBatch({
      data: cachedEvents.data,
      headers: cachedEvents.headers,
    });
  }

  /**
   * Validates the block number in the cached events against the current block number.
   *
   * This method checks if the cached events are up to date by comparing the current block number
   * with the end block number in the cache. It logs a message if the cache is valid and a warning if it is not.
   *
   * @param {SigningKeyEventsCache} cachedEvents - The cached events containing block headers to validate.
   * @param {number} currentBlock - The current block number to compare against the cached block.
   * @returns {boolean} `true` if the cache is valid (i.e., the current block number is greater than or equal to the cached end block), `false` otherwise.
   */
  public validateCacheBlock(
    cachedEvents: SigningKeyEventsCache,
    currentBlock: number,
  ): boolean {
    const isCacheValid = currentBlock >= cachedEvents.headers.endBlock;

    const blocks = {
      cachedStartBlock: cachedEvents.headers.startBlock,
      cachedEndBlock: cachedEvents.headers.endBlock,
      currentBlock,
    };

    if (isCacheValid) {
      this.logger.log('Signing keys events cache has valid age', blocks);
    }

    if (!isCacheValid) {
      this.logger.warn(
        'Signing key events cache is newer than the current block',
        blocks,
      );
    }

    return isCacheValid;
  }

  /**
   * Validates the block hash of signing key events.
   *
   * This method checks each event's block hash against the provided block hash, but only if the event's block number
   * matches the given `blockNumber`. This ensures that the events are not from an alternate chain (e.g., due to a chain reorganization).
   * If a block number match is found but the block hashes do not match, an error is thrown.
   *
   * @param {SigningKeyEvent[]} events - The list of signing key events to be checked.
   * @param {number} blockNumber - The block number to match against the events' block numbers.
   * @param {string} blockHash - The block hash to match against the events' block hashes.
   * @throws {Error} If any event's block hash does not match the provided block hash for the specified block number.
   */
  public checkEventsBlockHash(
    events: SigningKeyEvent[],
    blockNumber: number,
    blockHash: string,
  ): void {
    events.forEach((event) => {
      if (event.blockNumber === blockNumber && event.blockHash !== blockHash) {
        throw new Error(
          'Blockhash of the received events does not match the current blockhash',
        );
      }
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

    const block = CURATED_MODULE_DEPLOYMENT_BLOCK_NETWORK[chainId];
    if (block == null) throw new Error(`Chain ${chainId} is not supported`);

    return block;
  }
}
