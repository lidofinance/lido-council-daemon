import { Inject, Injectable, LoggerService } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService } from 'provider';
import { MAX_BLOCK_DELAY_SECONDS } from './health.constants';

@Injectable()
export class ProviderHealthIndicator extends HealthIndicator {
  constructor(
    private providerService: ProviderService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
  ) {
    super();
  }

  async getBlockTimestamp() {
    try {
      const block = await this.providerService.getBlock();
      return block.timestamp;
    } catch (error) {
      this.logger.warn('Failed to get block timestamp', error);
      return -1;
    }
  }

  getNowTimestamp() {
    return Math.floor(Date.now() / 1000);
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const blockTimestamp = await this.getBlockTimestamp();
    const nowTimestamp = this.getNowTimestamp();
    const deltaTimestamp = Math.abs(nowTimestamp - blockTimestamp);

    const isHealthy = deltaTimestamp < MAX_BLOCK_DELAY_SECONDS;
    const result = this.getStatus(key, isHealthy, {
      blockTimestamp,
      nowTimestamp,
    });

    if (isHealthy) return result;
    throw new HealthCheckError('Provider check failed', result);
  }
}
