import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { DepositRegistryService } from 'contracts/deposits-registry';
import { SecurityService } from 'contracts/security';

import { BlockData } from '../interfaces';

import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  METRIC_BLOCK_DATA_REQUEST_DURATION,
  METRIC_BLOCK_DATA_REQUEST_ERRORS,
} from 'common/prometheus';
import { Counter, Histogram } from 'prom-client';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';
import { WalletService } from 'wallet';
import { StakingRouterService } from 'contracts/staking-router';

@Injectable()
export class BlockDataCollectorService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,

    @InjectMetric(METRIC_BLOCK_DATA_REQUEST_DURATION)
    private blockRequestsHistogram: Histogram<string>,

    @InjectMetric(METRIC_BLOCK_DATA_REQUEST_ERRORS)
    private blockErrorsCounter: Counter<string>,

    private walletService: WalletService,

    private depositService: DepositRegistryService,
    private securityService: SecurityService,
    private stakingRouterService: StakingRouterService,

    private stakingModuleGuardService: StakingModuleGuardService,
  ) {}

  /**
   * Collects data from contracts in one place and by block hash,
   * to reduce the probability of getting data from different blocks
   * @returns collected data from the current block
   */
  public async getCurrentBlockData({
    blockNumber,
    blockHash,
  }: {
    blockNumber: number;
    blockHash: string;
  }): Promise<BlockData> {
    const endTimer = this.blockRequestsHistogram.startTimer();
    try {
      const guardianAddress = this.securityService.getGuardianAddress();
      const [
        depositRoot,
        depositedEvents,
        guardianIndex,
        lidoWC,
        securityVersion,
        walletBalanceCritical,
      ] = await Promise.all([
        this.depositService.getDepositRoot({ blockHash }),
        this.depositService.getAllDepositedEvents(blockNumber, blockHash),
        this.securityService.getGuardianIndex({ blockHash }),
        this.stakingRouterService.getWithdrawalCredentials({ blockHash }),
        this.securityService.version({
          blockHash,
        }),
        this.walletService.isBalanceCritical(),
      ]);

      const theftHappened =
        await this.stakingModuleGuardService.getHistoricalFrontRun(
          depositedEvents,
          lidoWC,
        );

      const alreadyPausedDeposits = await this.alreadyPausedDeposits(blockHash);

      if (alreadyPausedDeposits) {
        this.logger.warn('Deposits are already paused', {
          blockNumber,
          blockHash,
        });
      }

      return {
        blockNumber,
        blockHash,
        depositRoot,
        depositedEvents,
        guardianAddress,
        guardianIndex,
        lidoWC,
        securityVersion,
        alreadyPausedDeposits,
        theftHappened,
        walletBalanceCritical,
      };
    } catch (error) {
      this.blockErrorsCounter.inc();
      this.logger.error(error);
      throw error;
    } finally {
      endTimer();
    }
  }

  private async alreadyPausedDeposits(blockHash: string) {
    const alreadyPaused = await this.securityService.isDepositsPaused({
      blockHash,
    });

    return alreadyPaused;
  }
}
