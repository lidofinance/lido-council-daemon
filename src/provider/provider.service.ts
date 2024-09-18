import { Block } from '@ethersproject/abstract-provider';
import { CHAINS } from '@lido-sdk/constants';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { sleep } from 'utils';
import { RpcBatchProvider, RpcProvider } from './interfaces';
import {
  ERRORS_LIMIT_EXCEEDED,
  FETCH_EVENTS_RETRY_TIMEOUT_MS,
} from './provider.constants';

@Injectable()
export class ProviderService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,

    public provider: RpcProvider,
    public batchProvider: RpcBatchProvider,
  ) {}

  /**
   * Returns a new instance of provider
   */
  public getNewProviderInstance(): RpcProvider {
    return this.provider.clone();
  }

  /**
   * Returns a new instance of batch provider
   */
  public getNewBatchProviderInstance(): RpcBatchProvider {
    return this.batchProvider.clone();
  }

  /**
   * Returns current chain id
   */
  public async getChainId(): Promise<number> {
    const { chainId } = await this.provider.getNetwork();
    return chainId;
  }

  /**
   * Returns current block number
   */
  public async getBlockNumber(): Promise<number> {
    const cachedBlockNumber = this.provider.blockNumber;

    return cachedBlockNumber === -1
      ? await this.provider.getBlockNumber()
      : cachedBlockNumber;
  }

  /**
   * Returns current block
   */
  public async getBlock(tag: string | number = 'latest'): Promise<Block> {
    return await this.provider.getBlock(tag);
  }

  /**
   * Returns network name
   */
  public async getNetworkName(): Promise<string> {
    const network = await this.provider.getNetwork();
    const name = CHAINS[network.chainId]?.toLocaleLowerCase();
    return name || network.name;
  }

  /**
   * Returns events in the block range
   * If the request failed, it tries to repeat it or split it into two
   * @param startBlock - start of the range
   * @param endBlock - end of the range
   * @param fetcher - function that returns events
   * @returns event group
   */
  public async fetchEventsFallOver<
    E extends unknown,
    T extends { events: E[]; startBlock: number; endBlock: number },
  >(
    startBlock: number,
    endBlock: number,
    fetcher: (startBlock: number, endBlock: number) => Promise<T>,
  ): Promise<{ events: E[]; startBlock: number; endBlock: number }> {
    try {
      const data = await fetcher(startBlock, endBlock);
      return {
        events: data.events,
        startBlock: data.startBlock,
        endBlock: data.endBlock,
      };
    } catch (error: any) {
      const errorCode = error?.error?.code;
      const isLimitExceeded = ERRORS_LIMIT_EXCEEDED.includes(errorCode);
      const isTimeout = error?.code === 'TIMEOUT';
      const isServerError = error?.code === 'SERVER_ERROR';
      const isMissingResponse = error?.reason === 'missing response';

      const isPartitionRequired =
        isTimeout || isLimitExceeded || isMissingResponse || isServerError;

      const isPartitionable = endBlock - startBlock > 1;

      if (isPartitionable && isPartitionRequired) {
        this.logger.debug?.(`Failing to get events, splitting into chunks`, {
          startBlock,
          endBlock,
        });

        const center = Math.ceil((endBlock + startBlock) / 2);
        const [first, second] = await Promise.all([
          this.fetchEventsFallOver(startBlock, center - 1, fetcher),
          this.fetchEventsFallOver(center, endBlock, fetcher),
        ]);

        const events = first.events.concat(second.events) as E[];

        return { events, startBlock, endBlock };
      } else {
        this.logger.warn('Fetch error. Retry', error);

        await sleep(FETCH_EVENTS_RETRY_TIMEOUT_MS);
        return await this.fetchEventsFallOver(startBlock, endBlock, fetcher);
      }
    }
  }
}
