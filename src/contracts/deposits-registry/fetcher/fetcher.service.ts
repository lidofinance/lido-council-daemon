import { Injectable, Inject, LoggerService } from '@nestjs/common';
import { BlsService } from 'bls';
import { RepositoryService } from 'contracts/repository';
import { DepositEventEvent } from 'generated/DepositAbi';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { fetchEventsFallOver } from 'utils/fetch-events-utils';
import { parseLittleEndian64 } from '../crypto';
import { DEPLOYMENT_BLOCK_NETWORK } from '../deposits-registry.constants';
import { DepositEvent, VerifiedDepositEventGroup } from '../interfaces';
import { DepositTree } from '../sanity-checker/integrity-checker/deposit-tree';

@Injectable()
export class DepositsRegistryFetcherService {
  constructor(
    private provider: SimpleFallbackJsonRpcBatchProvider,
    private repositoryService: RepositoryService,
    private blsService: BlsService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
  ) {}

  /**
   * Returns events in the block range and verify signature
   * If the request failed, it tries to repeat it or split it into two
   * @param startBlock - start of the range
   * @param endBlock - end of the range
   * @returns event group
   */
  public async fetchEventsFallOver(
    startBlock: number,
    endBlock: number,
  ): Promise<VerifiedDepositEventGroup> {
    return await fetchEventsFallOver(
      startBlock,
      endBlock,
      this.fetchEvents.bind(this),
      this.logger,
    );
  }

  /**
   * Returns events in the block range and verify signature
   * @param startBlock - start of the range
   * @param endBlock - end of the range
   * @returns event group
   */
  public async fetchEvents(
    startBlock: number,
    endBlock: number,
  ): Promise<VerifiedDepositEventGroup> {
    this.logger.log('fetchEvents: getting contract', {
      startBlock,
      endBlock,
    });
    const contract = await this.repositoryService.getCachedDepositContract();

    this.logger.log('fetchEvents: starting queryFilter', {
      startBlock,
      endBlock,
    });
    const queryStartTime = Date.now();
    const filter = contract.filters.DepositEvent();
    const rawEvents = await contract.queryFilter(filter, startBlock, endBlock);
    const queryDurationMs = Date.now() - queryStartTime;

    this.logger.log('fetchEvents: queryFilter completed', {
      startBlock,
      endBlock,
      eventsCount: rawEvents.length,
      queryDurationMs,
    });

    if (rawEvents.length === 0) {
      return { events: [], startBlock, endBlock };
    }

    this.logger.log('fetchEvents: starting BLS verification', {
      eventsCount: rawEvents.length,
    });

    const blsStartTime = Date.now();
    const events = rawEvents.map((rawEvent, index) => {
      if (index > 0 && index % 2000 === 0) {
        const elapsed = Date.now() - blsStartTime;
        this.logger.log('fetchEvents: BLS verification progress', {
          processed: index,
          total: rawEvents.length,
          elapsedMs: elapsed,
        });
      }
      const formatted = this.formatEvent(rawEvent);
      const valid = this.verifyDeposit(formatted);
      return { valid, ...formatted };
    });
    const blsDurationMs = Date.now() - blsStartTime;

    const avgPerEvent = blsDurationMs / rawEvents.length;
    this.logger.log('fetchEvents: BLS verification completed', {
      eventsCount: rawEvents.length,
      blsDurationMs,
      avgPerEventMs: Math.round(avgPerEvent * 100) / 100,
    });

    return { events, startBlock, endBlock };
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
   * Verifies a deposit signature
   */
  public verifyDeposit(depositEvent: DepositEvent): boolean {
    const { pubkey, wc, amount, signature } = depositEvent;
    return this.blsService.verify({ pubkey, wc, amount, signature });
  }

  /**
   * Returns a block number when the deposited contract was deployed
   * @returns block number
   */
  public async getDeploymentBlockByNetwork(): Promise<number> {
    const network = await this.provider.getNetwork();
    const chainId = network.chainId;
    const address = DEPLOYMENT_BLOCK_NETWORK[chainId];
    if (address == null) throw new Error(`Chain ${chainId} is not supported`);

    return address;
  }
}
