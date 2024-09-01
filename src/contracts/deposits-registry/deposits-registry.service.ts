import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService } from 'provider';
import {
  DEPOSIT_EVENTS_STEP,
  getDeploymentBlockByNetwork,
  DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE,
  DEPOSIT_EVENTS_CACHE_LAG_BLOCKS,
} from './deposit.constants';
import {
  VerifiedDepositEventsCache,
  VerifiedDepositedEventGroup,
} from './interfaces';
import { RepositoryService } from 'contracts/repository';
import { BlockTag } from 'provider';
import { BlsService } from 'bls';
import { DepositIntegrityCheckerService } from './integrity-checker';
import { LevelDBService } from './leveldb';
import { DepositCacheIntegrityError } from './integrity-checker/constants';

@Injectable()
export class DepositService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private repositoryService: RepositoryService,

    private blsService: BlsService,
    private depositIntegrityCheckerService: DepositIntegrityCheckerService,
    private levelDBCacheService: LevelDBService,
  ) {}

  public async handleNewBlock(blockNumber: number): Promise<void> {
    if (blockNumber % DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE !== 0) return;

    // The event cache is stored with an N block lag to avoid caching data from uncle blocks
    // so we don't worry about blockHash here
    const toBlockNumber = await this.updateEventsCache();
    await this.checkDepositCacheIntegrity(toBlockNumber);
  }

  public async initialize(blockNumber: number) {
    await this.levelDBCacheService.initialize();

    const cachedEvents = await this.levelDBCacheService.getEventsCache();
    const isCacheValid = this.validateCache(cachedEvents, blockNumber);

    if (!isCacheValid) {
      process.exit(1);
    }
    await this.depositIntegrityCheckerService.initialize(cachedEvents);
    // it is necessary to load fresh events before integrity check
    // because we can only compare roots of the last 128 blocks.
    const toBlockNumber = await this.updateEventsCache();
    await this.checkDepositCacheIntegrity(toBlockNumber);
  }

  public async checkDepositCacheIntegrity(toBlockNumber: number) {
    try {
      await this.depositIntegrityCheckerService.checkFinalizedRoot(
        toBlockNumber,
      );
    } catch (error) {
      if (error instanceof DepositCacheIntegrityError) {
        return this.logger.error(
          `Deposit event cache integrity error on block number: ${toBlockNumber}`,
        );
      }
      throw error;
    }
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
  public async getCachedEvents(): Promise<VerifiedDepositEventsCache> {
    const { headers, ...rest } =
      await this.levelDBCacheService.getEventsCache();
    const deploymentBlock = await this.getDeploymentBlockByNetwork();

    return {
      headers: {
        ...headers,
        startBlock: Math.max(headers.startBlock, deploymentBlock),
        endBlock: Math.max(headers.endBlock, deploymentBlock),
      },
      ...rest,
    };
  }

  /**
   * Saves deposited events to cache
   */
  public async setCachedEvents(
    cachedEvents: VerifiedDepositEventsCache,
  ): Promise<void> {
    await this.levelDBCacheService.deleteCache();
    await this.levelDBCacheService.insertEventsCacheBatch({
      ...cachedEvents,
      headers: {
        ...cachedEvents.headers,
      },
    });
  }

  /**
   * Updates the cache deposited events
   * The last N blocks are not stored, in order to avoid storing reorganized blocks
   */
  public async updateEventsCache(): Promise<number> {
    const fetchTimeStart = performance.now();

    const [currentBlock, initialCache] = await Promise.all([
      this.providerService.getBlockNumber(),
      this.getCachedEvents(),
    ]);

    const firstNotCachedBlock = initialCache.headers.endBlock + 1;
    const toBlock = currentBlock - DEPOSIT_EVENTS_CACHE_LAG_BLOCKS;

    const totalEventsCount = initialCache.data.length;
    let newEventsCount = 0;

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

      await this.levelDBCacheService.insertEventsCacheBatch({
        headers: {
          ...initialCache.headers,
          endBlock: chunkEventGroup.endBlock,
        },
        data: chunkEventGroup.events,
      });

      await this.depositIntegrityCheckerService.putFinalizedEvents(
        chunkEventGroup.events,
      );

      newEventsCount += chunkEventGroup.events.length;

      this.logger.log('Historical events are fetched', {
        toBlock,
        startBlock: chunkStartBlock,
        endBlock: chunkToBlock,
      });
    }

    const fetchTimeEnd = performance.now();
    const fetchTime = Math.ceil(fetchTimeEnd - fetchTimeStart) / 1000;
    // TODO: replace timer with metric

    this.logger.log('Deposit events cache is updated', {
      newEventsCount,
      totalEventsCount: totalEventsCount + newEventsCount,
      fetchTime,
    });

    return toBlock;
  }

  /**
   * Returns all deposited events based on cache and fresh data
   */
  public async getAllDepositedEvents(
    blockNumber: number,
    blockHash: string,
  ): Promise<VerifiedDepositedEventGroup> {
    const endBlock = blockNumber;
    const cachedEvents = await this.getCachedEvents();
    //!!!!
    // если мы измкеним поведение таким образом
    // то у нас появится инвариант когда мы сами кораптим кэш
    // 1,2,3,4
    //
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

    this.logger.debug?.('Fresh deposit events are fetched', {
      events: freshEvents.length,
      startBlock: firstNotCachedBlock,
      endBlock,
      blockHash,
      lastEventBlockHash,
    });

    const mergedEvents = cachedEvents.data.concat(freshEvents);

    return {
      events: mergedEvents,
      startBlock: cachedEvents.headers.startBlock,
      endBlock,
      // declare a separate method where we store the latest events in the closure
      checkRoot: async () => {
        await this.depositIntegrityCheckerService.checkLatestRoot(
          blockNumber,
          freshEvents,
        );
      },
    };
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
