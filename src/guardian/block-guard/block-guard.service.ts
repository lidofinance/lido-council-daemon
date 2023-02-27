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

    private depositService: DepositService,
    private securityService: SecurityService,
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
    return lastMeta.blockHash !== newMeta.blockHash;
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

      const [depositRoot, depositedEvents, guardianIndex] = await Promise.all([
        this.depositService.getDepositRoot({ blockHash }),
        this.depositService.getAllDepositedEvents(blockNumber, blockHash),
        this.securityService.getGuardianIndex({ blockHash }),
        this.depositService.handleNewBlock(blockNumber),
      ]);

      return {
        blockNumber,
        blockHash,
        depositRoot,
        depositedEvents,
        guardianAddress,
        guardianIndex,
      };
    } catch (error) {
      this.blockErrorsCounter.inc();
      throw error;
    } finally {
      endTimer();
    }
  }
}
