import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { StakingRouterService } from 'contracts/staking-router';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService } from 'provider';
import {
  SigningKeyEvent,
  SigningKeyEventsGroup,
} from '../interfaces/event.interface';

@Injectable()
export class SigningKeysRegistryFetcherService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private stakingRouterService: StakingRouterService,
  ) {}

  /**
   * Fetches signing key events within a specified block range, with fallback mechanisms.
   * If the request failed, it tries to repeat it or split it into two
   *
   * @param {number} startBlock - The starting block number of the range.
   * @param {number} endBlock - The ending block number of the range.
   * @returns {Promise<SigningKeyEventsGroup>} Events fetched within the specified block range
   */
  public async fetchEventsFallOver(
    startBlock: number,
    endBlock: number,
    stakingModulesAddresses: string[],
  ): Promise<SigningKeyEventsGroup> {
    const fetcherWrapper = (start: number, end: number) =>
      this.fetchEvents(start, end, stakingModulesAddresses);

    return await this.providerService.fetchEventsFallOver(
      startBlock,
      endBlock,
      fetcherWrapper,
    );
  }

  /**
   * Fetches signing key events within a specified block range from staking module contracts.
   *
   * @param {number} startBlock - The starting block number of the range.
   * @param {number} endBlock - The ending block number of the range.
   * @returns {Promise<SigningKeyEventsGroup>} Events fetched within the specified block range.
   */
  public async fetchEvents(
    startBlock: number,
    endBlock: number,
    stakingModulesAddresses: string[],
  ): Promise<SigningKeyEventsGroup> {
    const events: SigningKeyEvent[] = [];

    await Promise.all(
      stakingModulesAddresses.map(async (address) => {
        const rawEvents =
          await this.stakingRouterService.getSigningKeyAddedEvents(
            startBlock,
            endBlock,
            address,
          );

        const moduleEvents: SigningKeyEvent[] = rawEvents.map((rawEvent) => {
          return {
            operatorIndex: rawEvent.args[0].toNumber(),
            key: rawEvent.args[1],
            moduleAddress: address,
            blockNumber: rawEvent.blockNumber,
            logIndex: rawEvent.logIndex,
            blockHash: rawEvent.blockHash,
          };
        });

        events.push(...moduleEvents);

        this.logger.log('Fetched signing keys add events for staking module', {
          count: moduleEvents.length,
          address,
        });
      }),
    );

    return { events, startBlock, endBlock };
  }
}
