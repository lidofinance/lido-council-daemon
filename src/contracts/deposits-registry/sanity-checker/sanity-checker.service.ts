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
    chunkStartBlock: number,
    chunkToBlock: number,
    events: VerifiedDepositEvent[],
  ) {
    if (!events.length) return;

    const tree = await this.indexEventsChunk(events);

    this.logger.log('Deposit events chunk was verified', {
      chunkStartBlock,
      chunkToBlock,
      depositRoot: tree.getRoot(),
    });
  }

  /**
   * Verifies the integrity of the latest deposit events. If the last event is absent,
   * it checks the validity of the last finalized root using the current block hash.
   * Otherwise, it checks for reorganizations and matches the deposit root of the events.
   *
   * @param {string} currentBlockHash - The hash of the current block being processed.
   * @param {VerifiedDepositEvent[]} freshEvents - Array of freshly verified deposit events.
   * @returns {Promise<boolean>} - Returns true if the deposit root matches and no reorganization is found, otherwise false.
   */
  public async verifyFreshEvents(
    currentBlockHash: string,
    freshEvents: VerifiedDepositEvent[],
  ) {
    const lastEvent = freshEvents[freshEvents.length - 1];

    // If there is no last event, validate the finalized root for the current block hash.
    if (!lastEvent) {
      return this.depositsIntegrityChecker.checkFinalizedRoot(currentBlockHash);
    }

    const { blockHash, blockNumber } = lastEvent;

    // Check for a reorganization in the blockchain that might affect the deposit events.
    const isReorgFound = this.findReorganization(
      blockNumber,
      blockHash,
      freshEvents,
    );

    // If a reorganization is found, return false as the events might not be in the correct state.
    if (isReorgFound) return false;

    // Check if the deposit root of the events matches the expected values.
    const isDepositRootMatches = await this.checkFreshEventsChunk(
      blockNumber,
      freshEvents,
    );

    return isDepositRootMatches;
  }

  public async verifyUpdatedEvents(blockNumber: number) {
    return this.depositsIntegrityChecker.checkFinalizedRoot(blockNumber);
  }
}
