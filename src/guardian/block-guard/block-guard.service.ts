import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { DepositService } from 'contracts/deposit';
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
export class BlockGuardService {
  protected lastProcessedStateMeta?: { blockHash: string; blockNumber: number };

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,

    @InjectMetric(METRIC_BLOCK_DATA_REQUEST_DURATION)
    private blockRequestsHistogram: Histogram<string>,

    @InjectMetric(METRIC_BLOCK_DATA_REQUEST_ERRORS)
    private blockErrorsCounter: Counter<string>,

    private walletService: WalletService,

    private depositService: DepositService,
    private securityService: SecurityService,
    private stakingRouterService: StakingRouterService,

    private stakingModuleGuardService: StakingModuleGuardService,
  ) {}

  public isNeedToProcessNewState(newMeta: {
    blockHash: string;
    blockNumber: number;
  }) {
    const lastMeta = this.lastProcessedStateMeta;
    if (!lastMeta) return true;
    if (lastMeta.blockNumber > newMeta.blockNumber) {
      this.logger.error('Keys-api returns old state', newMeta);
      return false;
    }
    const isSameBlock = lastMeta.blockHash !== newMeta.blockHash;

    if (!isSameBlock) {
      this.logger.log(`The block has not changed since the last cycle. Exit`, {
        newMeta,
      });
    }

    return isSameBlock;
  }

  public setLastProcessedStateMeta(newMeta: {
    blockHash: string;
    blockNumber: number;
  }) {
    this.lastProcessedStateMeta = newMeta;
  }

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
      ] = await Promise.all([
        this.depositService.getDepositRoot({ blockHash }),
        this.depositService.getAllDepositedEvents(blockNumber, blockHash),
        this.securityService.getGuardianIndex({ blockHash }),
        this.stakingRouterService.getWithdrawalCredentials({ blockHash }),
        this.securityService.version({
          blockHash,
        }),
      ]);

      const theftHappened =
        await this.stakingModuleGuardService.getHistoricalFrontRun(
          depositedEvents,
          lidoWC,
        );

      const alreadyPausedDeposits = await this.alreadyPausedDeposits(
        blockHash,
        securityVersion,
      );

      if (alreadyPausedDeposits) {
        this.logger.warn('Deposits are already paused', {
          blockNumber,
          blockHash,
        });
      }

      const walletBalanceCritical =
        await this.walletService.isBalanceCritical();

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

  private async alreadyPausedDeposits(
    blockHash: string,
    securityVersion: number,
  ) {
    if (securityVersion === 3) {
      const alreadyPaused = await this.securityService.isDepositsPaused({
        blockHash,
      });

      return alreadyPaused;
    }

    // for earlier versions DSM contact didn't have this method
    // we check pause for every method via staking router contract
    return false;
  }
}
