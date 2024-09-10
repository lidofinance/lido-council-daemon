import { Injectable } from '@nestjs/common';
import { BlsService } from 'bls';
import { RepositoryService } from 'contracts/repository';
import { DepositEventEvent } from 'generated/DepositAbi';

import { ProviderService } from 'provider';
import { parseLittleEndian64 } from '../crypto';
import { DEPLOYMENT_BLOCK_NETWORK } from '../deposits-registry.constants';
import { DepositEvent, VerifiedDepositEventGroup } from '../interfaces';
import { DepositTree } from '../sanity-checker/integrity-checker/deposit-tree';

@Injectable()
export class DepositsRegistryFetcherService {
  constructor(
    private providerService: ProviderService,
    private repositoryService: RepositoryService,
    private blsService: BlsService,
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
    return await this.providerService.fetchEventsFallOver(
      startBlock,
      endBlock,
      this.fetchEvents.bind(this),
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
    const chainId = await this.providerService.getChainId();
    const address = DEPLOYMENT_BLOCK_NETWORK[chainId];
    if (address == null) throw new Error(`Chain ${chainId} is not supported`);

    return address;
  }
}
