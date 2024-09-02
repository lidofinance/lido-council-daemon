import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  VerifiedDepositEvent,
  VerifiedDepositEventsCache,
} from '../interfaces';
import { BlockchainCheckerService } from './blockchain-checker/blockchain-checker.service';
import { DepositIntegrityCheckerService } from './integrity-checker';

@Injectable()
export class DepositRegistrySanityCheckerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private blockchainSanityChecker: BlockchainCheckerService,
    private depositsIntegrityChecker: DepositIntegrityCheckerService,
  ) {}

  public async initialize(initialEventsCache: VerifiedDepositEventsCache) {
    await this.depositsIntegrityChecker.initialize(initialEventsCache);
  }

  private async indexEventsChunk(events: VerifiedDepositEvent[]) {
    return await this.depositsIntegrityChecker.putFinalizedEvents(events);
  }
  // putLatestEvents
  private async checkFreshEventsChunk(
    blockNumber: number,
    events: VerifiedDepositEvent[],
  ) {
    return await this.depositsIntegrityChecker.checkLatestRoot(
      blockNumber,
      events,
    );
  }

  private findReorganization(
    blockNumber: number,
    blockHash: string,
    events: VerifiedDepositEvent[],
  ) {
    const event = this.blockchainSanityChecker.findReorganizedEvent(
      events,
      blockNumber,
      blockHash,
    );

    if (event) {
      this.logger.error('Reorganization found in deposit event', {
        blockHash: event.blockHash,
        blockNumber: event.blockNumber,
        depositDataRoot: event.depositDataRoot,
      });
      return true;
    }
    return false;
  }

  public verifyCacheBlock(
    cachedEvents: VerifiedDepositEventsCache,
    currentBlock: number,
  ) {
    const isCacheValid = this.blockchainSanityChecker.validateCacheBlock(
      cachedEvents,
      currentBlock,
    );

    const blocks = {
      cachedStartBlock: cachedEvents.headers.startBlock,
      cachedEndBlock: cachedEvents.headers.endBlock,
      currentBlock,
    };

    if (isCacheValid) {
      this.logger.log('Deposit events cache has valid age', blocks);
    }

    if (!isCacheValid) {
      this.logger.error(
        'Deposit events cache is newer than the current block',
        blocks,
      );
    }

    return isCacheValid;
  }

  public async verifyEventsChunk(
    blockNumber: number,
    blockHash: string,
    events: VerifiedDepositEvent[],
  ) {
    const isReorgFound = this.findReorganization(
      blockNumber,
      blockHash,
      events,
    );

    if (isReorgFound) return false;

    const tree = await this.indexEventsChunk(events);

    this.logger.log('Deposit events chunk was verified', {
      blockNumber,
      blockHash,
      depositRoot: tree.getRoot(),
    });

    return true;
  }

  public async verifyFreshEvents(
    blockNumber: number,
    blockHash: string,
    events: VerifiedDepositEvent[],
  ) {
    const isReorgFound = this.findReorganization(
      blockNumber,
      blockHash,
      events,
    );

    if (isReorgFound) return false;

    const isDepositRootMatches = await this.checkFreshEventsChunk(
      blockNumber,
      events,
    );

    return isDepositRootMatches;
  }

  public async verifyUpdatedEvents(blockNumber: number) {
    return this.depositsIntegrityChecker.checkFinalizedRoot(blockNumber);
  }
}
