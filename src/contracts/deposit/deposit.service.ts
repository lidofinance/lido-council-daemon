import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService, ERROR_LIMIT_EXCEEDED } from 'provider';
import { DepositAbi, DepositAbi__factory } from 'generated';
import { DepositEventEvent } from 'generated/DepositAbi';
import {
  DEPOSIT_EVENTS_STEP,
  DEPOSIT_EVENTS_RETRY_TIMEOUT_MS,
  getDeploymentBlockByNetwork,
  DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE,
  DEPOSIT_EVENTS_CACHE_LAG_BLOCKS,
} from './deposit.constants';
import { DepositEvent, DepositEventGroup } from './interfaces';
import { sleep } from 'utils';
import { OneAtTime } from 'common/decorators';
import { SecurityService } from 'contracts/security';
import { CacheService } from 'cache';
import { BlockData } from 'guardian';

@Injectable()
export class DepositService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private securityService: SecurityService,
    private cacheService: CacheService<DepositEventGroup>,
  ) {}

  @OneAtTime()
  public async handleNewBlock({ blockNumber }: BlockData): Promise<void> {
    if (blockNumber % DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE !== 0) return;
    await this.updateEventsCache();
  }

  private cachedContract: DepositAbi | null = null;

  /**
   * Returns only required information about the event,
   * to reduce the size of the information stored in the cache
   */
  public formatEvent(rawEvent: DepositEventEvent): DepositEvent {
    const { args, transactionHash: tx, blockNumber } = rawEvent;
    const { withdrawal_credentials: wc, pubkey, amount, signature } = args;

    return { pubkey, wc, amount, signature, tx, blockNumber };
  }

  /**
   * Returns an instance of the contract
   */
  public async getContract(): Promise<DepositAbi> {
    if (!this.cachedContract) {
      const address = await this.securityService.getDepositContractAddress();
      const provider = this.providerService.provider;
      this.cachedContract = DepositAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
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
  public async getCachedEvents(): Promise<DepositEventGroup> {
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
    return await this.cacheService.setCache(eventGroup);
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
    try {
      return await this.fetchEvents(startBlock, endBlock);
    } catch (error: any) {
      const isLimitExceeded = error?.error?.code === ERROR_LIMIT_EXCEEDED;
      const isTimeout = error?.code === 'TIMEOUT';
      const isPartitionRequired = isTimeout || isLimitExceeded;

      const isPartitionable = endBlock - startBlock > 1;

      if (isPartitionable && isPartitionRequired) {
        this.logger.debug?.(`Limit exceeded, try to split the chunk`, {
          startBlock,
          endBlock,
        });

        const center = Math.ceil((endBlock + startBlock) / 2);
        const [first, second] = await Promise.all([
          this.fetchEventsFallOver(startBlock, center - 1),
          this.fetchEventsFallOver(center, endBlock),
        ]);

        const events = first.events.concat(second.events);

        return { events, startBlock, endBlock };
      } else {
        this.logger.warn('Fetch error. Retry', error);

        await sleep(DEPOSIT_EVENTS_RETRY_TIMEOUT_MS);
        return await this.fetchEventsFallOver(startBlock, endBlock);
      }
    }
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
    const contract = await this.getContract();
    const filter = contract.filters.DepositEvent();
    const rawEvents = await contract.queryFilter(filter, startBlock, endBlock);
    const events = rawEvents.map((rawEvent) => this.formatEvent(rawEvent));

    return { events, startBlock, endBlock };
  }

  /**
   * Returns fresh events
   * Gets the last events every time in case of reorganizations
   * @param startBlock - first not cached block
   * @param endBlock - current block
   * @returns event group
   */
  public async getFreshEvents(
    startBlock: number,
    endBlock: number,
  ): Promise<DepositEventGroup> {
    const eventGroup = await this.fetchEventsFallOver(startBlock, endBlock);

    const events = eventGroup.events.length;
    this.logger.debug?.('Fresh events are fetched', {
      startBlock,
      endBlock,
      events,
    });

    return eventGroup;
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
      const chunkToBlock = Math.min(
        currentBlock,
        block + DEPOSIT_EVENTS_STEP - 1,
      );

      const chunkEventGroup = await this.fetchEventsFallOver(
        chunkStartBlock,
        chunkToBlock,
      );

      eventGroup.endBlock = chunkEventGroup.endBlock;
      eventGroup.events = eventGroup.events.concat(chunkEventGroup.events);

      this.logger.log('Historical events are fetched', {
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

    this.logger.log('Cache is updated', {
      newEvents,
      totalEvents,
      fetchTime,
    });
  }

  /**
   * Returns all deposited events based on cache and fresh data
   */
  public async getAllDepositedEvents(): Promise<DepositEventGroup> {
    const [endBlock, cachedEvents] = await Promise.all([
      this.providerService.getBlockNumber(),
      this.getCachedEvents(),
    ]);

    const firstNotCachedBlock = cachedEvents.endBlock + 1;
    const freshEvents = await this.getFreshEvents(
      firstNotCachedBlock,
      endBlock,
    );

    const mergedEvents = cachedEvents.events.concat(freshEvents.events);

    return {
      events: mergedEvents,
      startBlock: cachedEvents.startBlock,
      endBlock,
    };
  }

  /**
   * Returns a deposit root
   */
  public async getDepositRoot(): Promise<string> {
    const contract = await this.getContract();
    const depositRoot = await contract.get_deposit_root();
    return depositRoot;
  }
}
