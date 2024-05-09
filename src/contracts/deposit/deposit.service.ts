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
  VerifiedDepositEventsCache,
  VerifiedDepositEventGroup,
} from './interfaces';
import { RepositoryService } from 'contracts/repository';
import { BlockTag } from 'provider';
import { BlsService } from 'bls';
import { APP_VERSION } from 'app.constants';
import { DepositIntegrityCheckerService } from './integrity-checker';
import { parseLittleEndian64 } from './deposit.utils';
import { DepositTree } from './deposit-tree';
import { LevelDBService } from './leveldb';

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
    await this.depositIntegrityCheckerService.checkFinalizedRoot(toBlockNumber);
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
    await this.depositIntegrityCheckerService.checkFinalizedRoot(toBlockNumber);
  }

  /**
   * Validates the app cache
   * @param cachedEvents - cached events
   * @param currentBlock - current block number
   * @returns true if cache is valid
   */
  public validateCache(
    cachedEvents: VerifiedDepositEventsCache,
    currentBlock: number,
  ): boolean {
    return this.validateCacheBlock(cachedEvents, currentBlock);
  }

  /**
   * Validates block number in the cache
   * @param cachedEvents - cached events
   * @param currentBlock - current block number
   * @returns true if cached app version is the same
   */
  public validateCacheBlock(
    cachedEvents: VerifiedDepositEventsCache,
    currentBlock: number,
  ): boolean {
    const isCacheValid = currentBlock >= cachedEvents.headers.endBlock;

    const blocks = {
      cachedStartBlock: cachedEvents.headers.startBlock,
      cachedEndBlock: cachedEvents.headers.endBlock,
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
    const {
      args,
      transactionHash: tx,
      blockNumber,
      blockHash,
      logIndex,
    } = rawEvent;
    const {
      withdrawal_credentials: wc,
      pubkey,
      amount,
      signature,
      index,
      ...rest
    } = args;

    const depositCount = rest['4'];

    const depositDataRoot = DepositTree.formDepositNode({
      pubkey,
      wc,
      signature,
      amount,
    });

    return {
      pubkey,
      wc,
      amount,
      signature,
      tx,
      blockNumber,
      blockHash,
      logIndex,
      index,
      depositCount: parseLittleEndian64(depositCount),
      depositDataRoot,
    };
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
        version: APP_VERSION,
      },
    });
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
  ): Promise<VerifiedDepositEventGroup> {
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
  ): Promise<VerifiedDepositEventGroup> {
    const contract = await this.repositoryService.getCachedDepositContract();
    const filter = contract.filters.DepositEvent();
    const rawEvents = await contract.queryFilter(filter, startBlock, endBlock);
    const events = rawEvents.map((rawEvent) => {
      const formatted = this.formatEvent(rawEvent);
      const valid = this.verifyDeposit(formatted);
      return { valid, ...formatted };
    });

    return { events, startBlock, endBlock };
  }

  /**
   * Updates the cache deposited events
   * The last N blocks are not stored, in order to avoid storing reorganized blocks
   */
  public async updateEventsCache(): Promise<number> {
    const fetchTimeStart = performance.now();

    const [currentBlock, initialCache] = await Promise.all([
      // TODO: check reorg, add finalized
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
  ): Promise<VerifiedDepositEventGroup> {
    const endBlock = blockNumber;
    const cachedEvents = await this.getCachedEvents();

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

    this.logger.debug?.('Fresh events are fetched', {
      events: freshEvents.length,
      startBlock: firstNotCachedBlock,
      endBlock,
      blockHash,
      lastEventBlockHash,
    });

    const mergedEvents = cachedEvents.data.concat(freshEvents);

    await this.depositIntegrityCheckerService.checkLatestRoot(
      blockNumber,
      freshEvents,
    );

    return {
      events: mergedEvents,
      startBlock: cachedEvents.headers.startBlock,
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

  /**
   * Verifies a deposit signature
   */
  public verifyDeposit(depositEvent: DepositEvent): boolean {
    const { pubkey, wc, amount, signature } = depositEvent;
    return this.blsService.verify({ pubkey, wc, amount, signature });
  }
}
