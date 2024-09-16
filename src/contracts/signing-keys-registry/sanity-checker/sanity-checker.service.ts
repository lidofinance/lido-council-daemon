import { Inject, Injectable, LoggerService } from '@nestjs/common';

import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { SigningKeyEventsCache } from '../interfaces/cache.interface';
import { SigningKeyEvent } from '../interfaces/event.interface';

@Injectable()
export class SigningKeysRegistrySanityCheckerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
  ) {}

  /**
   * Validates the block number in the cached events against the current block number.
   *
   * This method checks if the cached events are up to date by comparing the current block number
   * with the end block number in the cache. It logs a message if the cache is valid and a warning if it is not.
   *
   * @param {SigningKeyEventsCache} cachedEvents - The cached events containing block headers to validate.
   * @param {number} currentBlock - The current block number to compare against the cached block.
   * @returns {boolean} `true` if the cache is valid (i.e., the current block number is greater than or equal to the cached end block), `false` otherwise.
   */
  public verifyCacheBlock(
    cachedEvents: SigningKeyEventsCache,
    currentBlock: number,
  ): boolean {
    const isCacheValid = currentBlock >= cachedEvents.headers.endBlock;

    const blocks = {
      cachedStartBlock: cachedEvents.headers.startBlock,
      cachedEndBlock: cachedEvents.headers.endBlock,
      currentBlock,
    };

    if (isCacheValid) {
      this.logger.log('Signing keys events cache has valid age', blocks);
    }

    if (!isCacheValid) {
      this.logger.warn(
        'Signing key events cache is newer than the current block',
        blocks,
      );
    }

    return isCacheValid;
  }

  /**
   * Validates the block hash of signing key events.
   *
   * This method checks each event's block hash against the provided block hash, but only if the event's block number
   * matches the given `blockNumber`. This ensures that the events are not from an alternate chain (e.g., due to a chain reorganization).
   * If a block number match is found but the block hashes do not match, an error is thrown.
   *
   * @param {SigningKeyEvent[]} events - The list of signing key events to be checked.
   * @param {number} blockNumber - The block number to match against the events' block numbers.
   * @param {string} blockHash - The block hash to match against the events' block hashes.
   */
  public checkEventsBlockHash(
    events: SigningKeyEvent[],
    blockNumber: number,
    blockHash: string,
  ): boolean {
    const event = this.findReorganizedEvent(events, blockNumber, blockHash);
    if (event) {
      this.logger.error('Reorganization found in signing key event', {
        blockHash: event.blockHash,
        blockNumber: event.blockNumber,
      });
      return false;
    }
    return true;
  }

  /**
   * Checks events block hash
   * An additional check to avoid events processing in an alternate chain
   */
  private findReorganizedEvent(
    events: SigningKeyEvent[],
    blockNumber: number,
    blockHash: string,
  ): SigningKeyEvent | null {
    return (
      events.find(
        (event) =>
          event.blockNumber === blockNumber && event.blockHash !== blockHash,
      ) || null
    );
  }
}
