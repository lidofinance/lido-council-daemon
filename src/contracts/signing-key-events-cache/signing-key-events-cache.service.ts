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
   * @param blockNumber
   */
  public async initialize(blockNumber) {
    await this.levelDBCacheService.initialize();

    const cachedEvents = await this.getCachedEvents();

    // check age of cache
    // maybe we need to validate cache type
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
   */
  public async updateEventsCache(): Promise<number> {
    const fetchTimeStart = performance.now();

    const [latestBlock, initialCache] = await Promise.all([
      this.providerService.getBlockNumber(),
      this.getCachedEvents(),
    ]);

    // TODO: do we need to check cache validity ?

    const firstNotCachedBlock = initialCache.headers.endBlock + 1;
    const toBlock = latestBlock - SIGNING_KEYS_EVENTS_CACHE_LAG_BLOCKS;

    const totalEventsCount = initialCache.data.length;
    let newEventsCount = 0;

    const stakingModulesContracts =
      await this.repositoryService.getCachedStakingModulesContracts();
    const stakingModulesAddresses = Object.keys(stakingModulesContracts);

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

  public async getStakingModules(): Promise<string[]> {
    const stakingModulesContracts =
      await this.repositoryService.getCachedStakingModulesContracts();

    return Object.keys(stakingModulesContracts);
  }

  /**
   * Returns events in the block range
   * If the request failed, it tries to repeat it or split it into two
   * @param startBlock - start of the range
   * @param endBlock - end of the range
   * @returns SigningKeyEventsGroup
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
   * Returns events in the block range
   * @param startBlock - start of the range
   * @param endBlock - end of the range
   * @returns SigningKeyEventsGroup
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
   * Gets node operators data from cache
   * @returns event group
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
   * Got operators' keys list and find return all events for them
   */
  public async getEventsForOperatorsKeys(
    keys: string[],
  ): Promise<SigningKeyEventsCache> {
    const uniqueKeys = Array.from(new Set(keys));
    return await this.levelDBCacheService.getCachedEvents(uniqueKeys);
  }

  /**
   * Returns all signing keys events based on cache and fresh data for keys list
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

    // TODO: check
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
   * Saves signing keys events events to cache
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
   * Validates block number in the cache
   * @param cachedEvents - cached events
   * @param currentBlock - current block number
   * @returns true if cached app version is the same
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
   * Checks events block hash
   * An additional check to avoid events processing in an alternate chain
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
   * Returns a block number when the curated module contract was deployed
   * @returns block number
   */
  public async getDeploymentBlockByNetwork(): Promise<number> {
    const chainId = await this.providerService.getChainId();

    const block = CURATED_MODULE_DEPLOYMENT_BLOCK_NETWORK[chainId];
    if (block == null) throw new Error(`Chain ${chainId} is not supported`);

    return block;
  }
}
