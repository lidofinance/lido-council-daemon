import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService } from 'provider';
import { DepositEventEvent } from 'generated/DepositAbi';
import {
  DEPOSIT_EVENTS_STEP,
  getDeploymentBlockByNetwork,
  DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE,
  DEPOSIT_EVENTS_CACHE_LAG_BLOCKS,
} from './deposit.constants';
import {
  DepositEvent,
  DepositEventGroup,
  DepositEventsCache,
} from './interfaces';
import { OneAtTime } from 'common/decorators';
import { RepositoryService } from 'contracts/repository';
import { CacheService } from 'cache';
import { BlockData } from 'guardian';
import { BlockTag } from 'provider';
import { APP_VERSION } from 'app.constants';

@Injectable()
export class DepositService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private repositoryService: RepositoryService,
    private cacheService: CacheService<DepositEventsCache>,
  ) {}

  @OneAtTime()
  public async handleNewBlock({ blockNumber }: BlockData): Promise<void> {
    if (blockNumber % DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE !== 0) return;

    // The event cache is stored with an N block lag to avoid caching data from uncle blocks
    // so we don't worry about blockHash here
    await this.updateEventsCache();
  }

  async onModuleInit() {
    const currentBlock = await this.providerService.getBlockNumber();
    const cachedEvents = await this.getCachedEvents();
    const isCacheValid = this.validateCache(cachedEvents, currentBlock);

    if (isCacheValid) return;

    try {
      await this.deleteCachedEvents();
    } catch (error) {
      this.logger.error(error);
      process.exit(1);
    }
  }

  /**
   * Validates the app cache
   * @param cachedEvents - cached events
   * @param currentBlock - current block number
   * @returns true if cache is valid
   */
  public validateCache(
    cachedEvents: DepositEventsCache,
    currentBlock: number,
  ): boolean {
    return (
      this.validateCacheBlock(cachedEvents, currentBlock) &&
      this.validateCacheVersion(cachedEvents)
    );
  }

  /**
   * Validates app version in the cache
   * @param cachedEvents - cached events
   * @returns true if cached app version is the same
   */
  public validateCacheVersion(cachedEvents: DepositEventsCache): boolean {
    const isSameVersion = cachedEvents.version === APP_VERSION;

    const versions = {
      cachedVersion: cachedEvents.version,
      currentVersion: APP_VERSION,
    };

    if (isSameVersion) {
      this.logger.log(
        'Deposit events cache version matches the application version',
        versions,
      );
    }

    if (!isSameVersion) {
      this.logger.warn(
        'Deposit events cache does not match the application version, clearing the cache',
        versions,
      );
    }

    return isSameVersion;
  }

  /**
   * Validates block number in the cache
   * @param cachedEvents - cached events
   * @param currentBlock - current block number
   * @returns true if cached app version is the same
   */
  public validateCacheBlock(
    cachedEvents: DepositEventsCache,
    currentBlock: number,
  ): boolean {
    const isCacheValid = currentBlock >= cachedEvents.endBlock;

    const blocks = {
      cachedStartBlock: cachedEvents.startBlock,
      cachedEndBlock: cachedEvents.endBlock,
      currentBlock,
    };

    if (isCacheValid) {
      this.logger.log('Deposit events cache has valid age', blocks);
    }

    if (!isCacheValid) {
      this.logger.warn(
        'Deposit events cache is newer than the current block',
        blocks,
      );
    }

    return isCacheValid;
  }

  /**
   * Returns only required information about the event,
   * to reduce the size of the information stored in the cache
   */
  public formatEvent(rawEvent: DepositEventEvent): DepositEvent {
    const { args, transactionHash: tx, blockNumber, blockHash } = rawEvent;
    const { withdrawal_credentials: wc, pubkey, amount, signature } = args;

    return { pubkey, wc, amount, signature, tx, blockNumber, blockHash };
  }

  /**
   * Returns a block number when the deposited contract was deployed
   * @returns block number
   */
  public async getDeploymentBlockByNetwork(): Promise<number> {
    const chainId = await this.providerService.getChainId();
    return getDeploymentBlockByNetwork(chainId);
  }

  /**
   * Gets node operators data from cache
   * @returns event group
   */
  public async getCachedEvents(): Promise<DepositEventsCache> {
    const cachedEventGroup = await this.cacheService.getCache();
    const deploymentBlock = await this.getDeploymentBlockByNetwork();

    return {
      ...cachedEventGroup,
      startBlock: Math.max(cachedEventGroup.startBlock, deploymentBlock),
      endBlock: Math.max(cachedEventGroup.endBlock, deploymentBlock),
    };
  }

  /**
   * Saves deposited events to cache
   */
  public async setCachedEvents(eventGroup: DepositEventGroup): Promise<void> {
    return await this.cacheService.setCache({
      ...eventGroup,
      version: APP_VERSION,
    });
  }

  /**
   * Delete deposited events cache
   */
  public async deleteCachedEvents(): Promise<void> {
    await this.cacheService.deleteCache();
    this.logger.warn('Deposit events cache cleared');
  }

  /**
   * Returns events in the block range
   * If the request failed, it tries to repeat it or split it into two
   * @param startBlock - start of the range
   * @param endBlock - end of the range
   * @returns event group
   */
  public async fetchEventsFallOver(
    startBlock: number,
    endBlock: number,
  ): Promise<DepositEventGroup> {
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
   * @returns event group
   */
  public async fetchEvents(
    startBlock: number,
    endBlock: number,
  ): Promise<DepositEventGroup> {
    const contract = await this.repositoryService.getCachedDepositContract();
    const filter = contract.filters.DepositEvent();
    const rawEvents = await contract.queryFilter(filter, startBlock, endBlock);
    const events = rawEvents.map((rawEvent) => this.formatEvent(rawEvent));

    return { events, startBlock, endBlock };
  }

  /**
   * Updates the cache deposited events
   * The last N blocks are not stored, in order to avoid storing reorganized blocks
   */
  public async updateEventsCache(): Promise<void> {
    const fetchTimeStart = performance.now();

    const [currentBlock, initialCache] = await Promise.all([
      this.providerService.getBlockNumber(),
      this.getCachedEvents(),
    ]);

    const eventGroup = { ...initialCache };
    const firstNotCachedBlock = initialCache.endBlock + 1;
    const toBlock = currentBlock - DEPOSIT_EVENTS_CACHE_LAG_BLOCKS;

    for (
      let block = firstNotCachedBlock;
      block <= toBlock;
      block += DEPOSIT_EVENTS_STEP
    ) {
      const chunkStartBlock = block;
      const chunkToBlock = Math.min(toBlock, block + DEPOSIT_EVENTS_STEP - 1);

      const chunkEventGroup = await this.fetchEventsFallOver(
        chunkStartBlock,
        chunkToBlock,
      );

      eventGroup.endBlock = chunkEventGroup.endBlock;
      eventGroup.events = eventGroup.events.concat(chunkEventGroup.events);

      this.logger.log('Historical events are fetched', {
        toBlock,
        startBlock: chunkStartBlock,
        endBlock: chunkToBlock,
        events: eventGroup.events.length,
      });

      await this.setCachedEvents(eventGroup);
    }

    const totalEvents = eventGroup.events.length;
    const newEvents = totalEvents - initialCache.events.length;

    const fetchTimeEnd = performance.now();
    const fetchTime = Math.ceil(fetchTimeEnd - fetchTimeStart) / 1000;

    // TODO: replace timer with metric

    this.logger.log('Deposit events cache is updated', {
      newEvents,
      totalEvents,
      fetchTime,
    });
  }

  /**
   * Returns all deposited events based on cache and fresh data
   */
  public async getAllDepositedEvents(
    blockNumber: number,
    blockHash: string,
  ): Promise<DepositEventGroup> {
    const endBlock = blockNumber;
    const cachedEvents = await this.getCachedEvents();

    const isCacheValid = this.validateCacheBlock(cachedEvents, blockNumber);
    if (!isCacheValid) process.exit(1);

    const firstNotCachedBlock = cachedEvents.endBlock + 1;
    const freshEventGroup = await this.fetchEventsFallOver(
      firstNotCachedBlock,
      endBlock,
    );
    const freshEvents = freshEventGroup.events;
    const lastEvent = freshEvents[freshEvents.length - 1];
    const lastEventBlockHash = lastEvent?.blockHash;

    this.checkEventsBlockHash(freshEvents, blockNumber, blockHash);

    this.logger.debug?.('Fresh events are fetched', {
      events: freshEvents.length,
      startBlock: firstNotCachedBlock,
      endBlock,
      blockHash,
      lastEventBlockHash,
    });

    const mergedEvents = cachedEvents.events.concat(freshEvents);

    return {
      events: mergedEvents,
      startBlock: cachedEvents.startBlock,
      endBlock,
    };
  }

  /**
   * Checks events block hash
   * An additional check to avoid events processing in an alternate chain
   */
  public checkEventsBlockHash(
    events: DepositEvent[],
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
   * Returns a deposit root
   */
  public async getDepositRoot(blockTag?: BlockTag): Promise<string> {
    const contract = await this.repositoryService.getCachedDepositContract();
    const depositRoot = await contract.get_deposit_root({
      blockTag: blockTag as any,
    });

    return depositRoot;
  }
}
