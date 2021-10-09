import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LidoService } from 'lido';
import { ProviderService } from 'provider';
import { DepositAbi, DepositAbi__factory } from 'generated';
import { RegistryService } from 'registry';
import { ERROR_LIMIT_EXCEEDED } from 'provider';
import {
  DEPOSIT_EVENTS_STEP,
  DEPOSIT_FRESH_EVENTS_AMOUNT,
  getDeploymentBlockByNetwork,
} from './deposit.constants';
import { DepositCacheService } from './cache.service';
import { DepositEvent, DepositEventGroup } from './interfaces';
import { DepositEventEvent } from 'generated/DepositAbi';

@Injectable()
export class DepositService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly providerService: ProviderService,
    private readonly lidoService: LidoService,
    private readonly registryService: RegistryService,
    private readonly cacheService: DepositCacheService,
  ) {
    this.init();
  }

  private cachedContract: DepositAbi | null = null;

  private async getContract(): Promise<DepositAbi> {
    if (!this.cachedContract) {
      const address = await this.getDepositAddress();
      const provider = this.providerService.provider;
      this.cachedContract = DepositAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  private async getCurrentBlock() {
    const provider = this.providerService.provider;
    const currentBlock = await provider.getBlockNumber();

    return currentBlock;
  }

  public async getDepositAddress(): Promise<string> {
    return await this.lidoService.getDepositContractAddress();
  }

  private async init(): Promise<void> {
    await this.fillCache();
    this.subscribeToDepositEvent();
  }

  private async fillCache(): Promise<void> {
    const [currentBlock, initialCache] = await Promise.all([
      this.getCurrentBlock(),
      this.getCachedEvents(),
    ]);

    const fetchTimeStart = performance.now();
    const eventGroup = { ...initialCache };
    const firstNotCachedBlock = initialCache.endBlock + 1;

    for (
      let block = firstNotCachedBlock;
      block <= currentBlock;
      block += DEPOSIT_EVENTS_STEP
    ) {
      const chunkStartBlock = block;
      const chunkToBlock = Math.min(
        currentBlock,
        block + DEPOSIT_EVENTS_STEP - 1,
      );

      const chunkEventGroup = await this.getEventsRecursive(
        chunkStartBlock,
        chunkToBlock,
      );

      eventGroup.endBlock = chunkEventGroup.endBlock;
      eventGroup.events = eventGroup.events.concat(chunkEventGroup.events);

      await this.setCachedEvents(eventGroup);
    }

    const cachedEventGroup = await this.getCachedEvents();
    const fetchTimeEnd = performance.now();
    const fetchTime = fetchTimeEnd - fetchTimeStart;
    const totalEvents = cachedEventGroup.events.length;

    this.logger.log(
      `Cache updated. Total events: ${totalEvents}, time: ${fetchTime}`,
    );
  }

  private async subscribeToDepositEvent(): Promise<void> {
    const provider = this.providerService.provider;
    const contract = await this.getContract();

    const depositEvent = contract.filters.DepositEvent();
    provider.on(depositEvent, () => this.fillCache());
  }

  private formatEvent(rawEvent: DepositEventEvent): DepositEvent {
    const { args, transactionHash: tx, blockNumber } = rawEvent;
    const { withdrawal_credentials: wc, pubkey, amount, signature } = args;

    return { pubkey, wc, amount, signature, tx, blockNumber };
  }

  private async getDeploymentBlockByNetwork(): Promise<number> {
    const chainId = await this.providerService.getChainId();
    return getDeploymentBlockByNetwork(chainId);
  }

  private async getCachedEvents(): Promise<DepositEventGroup> {
    const cachedEventGroup = await this.cacheService.getCache();
    const deploymentBlock = await this.getDeploymentBlockByNetwork();

    return {
      ...cachedEventGroup,
      startBlock: Math.max(cachedEventGroup.startBlock, deploymentBlock),
      endBlock: Math.max(cachedEventGroup.endBlock, deploymentBlock),
    };
  }

  private async setCachedEvents(eventGroup: DepositEventGroup): Promise<void> {
    return await this.cacheService.setCache(eventGroup);
  }

  private async getEventsRecursive(
    startBlock: number,
    endBlock: number,
  ): Promise<DepositEventGroup> {
    try {
      const eventGroup = await this.getEvents(startBlock, endBlock);
      this.logger.debug(
        `fetched ${startBlock}-${endBlock} | events ${eventGroup.events.length}`,
      );
      return eventGroup;
    } catch (error) {
      const isLimitExceeded = error?.error?.code === ERROR_LIMIT_EXCEEDED;
      const isTimeout = error?.code === 'TIMEOUT';
      const isPartitionRequired = isTimeout || isLimitExceeded;

      const isPartitionable = endBlock - startBlock > 1;

      if (isPartitionable && isPartitionRequired) {
        this.logger.debug(
          `limit exceeded ${startBlock}-${endBlock}, try to split the chunk`,
        );

        const center = Math.ceil((endBlock + startBlock) / 2);
        const [first, second] = await Promise.all([
          this.getEventsRecursive(startBlock, center - 1),
          this.getEventsRecursive(center, endBlock),
        ]);

        const events = first.events.concat(second.events);

        return { events, startBlock, endBlock };
      } else {
        throw error;
      }
    }
  }

  private async getEvents(
    startBlock: number,
    endBlock: number,
  ): Promise<DepositEventGroup> {
    const contract = await this.getContract();
    const filter = contract.filters.DepositEvent();
    const rawEvents = await contract.queryFilter(filter, startBlock, endBlock);
    const events = rawEvents.map((rawEvent) => this.formatEvent(rawEvent));

    return { events, startBlock, endBlock };
  }

  private async getFreshEvents(): Promise<DepositEventGroup> {
    const endBlock = await this.getCurrentBlock();
    const startBlock = endBlock - DEPOSIT_FRESH_EVENTS_AMOUNT;
    const eventGroup = await this.getEvents(startBlock, endBlock);

    return eventGroup;
  }

  public async getPubKeys() {
    const [cachedEvents, freshEvents] = await Promise.all([
      this.getCachedEvents(),
      this.getFreshEvents(),
    ]);

    if (cachedEvents.endBlock < freshEvents.startBlock) {
      throw new Error('Events are not collected yet');
    }

    const cachedPubKeys = cachedEvents.events.map(({ pubkey }) => pubkey);
    const freshPubKeys = freshEvents.events.map(({ pubkey }) => pubkey);
    const mergedPubKeys = cachedPubKeys.concat(freshPubKeys);

    return new Set(mergedPubKeys);
  }
}
