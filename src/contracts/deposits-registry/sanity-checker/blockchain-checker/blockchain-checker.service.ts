import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DepositEvent, VerifiedDepositEventsCache } from '../../interfaces';

@Injectable()
export class BlockchainCheckerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
  ) {}

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

    return isCacheValid;
  }

  /**
   * Checks events block hash
   * An additional check to avoid events processing in an alternate chain
   */
  public findReorganizedEvent(
    events: DepositEvent[],
    blockNumber: number,
    blockHash: string,
  ): DepositEvent | null {
    return (
      events.find(
        (event) =>
          event.blockNumber === blockNumber && event.blockHash !== blockHash,
      ) || null
    );
  }
}
