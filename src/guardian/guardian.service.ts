import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DepositService } from 'contracts/deposit';
import { SecurityService } from 'contracts/security';
import { ProviderService } from 'provider';
import {
  GUARDIAN_DEPOSIT_JOB_DURATION,
  GUARDIAN_DEPOSIT_JOB_NAME,
} from './guardian.constants';
import { OneAtTime } from 'common/decorators';
import { StakingRouterService } from 'staking-router';

import { BlockGuardService } from './block-guard';
import { StakingModuleGuardService } from './staking-module-guard';
import { GuardianMessageService } from './guardian-message';
import { GuardianMetricsService } from './guardian-metrics';

@Injectable()
export class GuardianService implements OnModuleInit {
  protected lastProcessedStateMeta?: { blockHash: string; blockNumber: number };

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,

    private schedulerRegistry: SchedulerRegistry,

    private depositService: DepositService,
    private securityService: SecurityService,
    private providerService: ProviderService,

    private stakingRouterService: StakingRouterService,

    private blockGuardService: BlockGuardService,
    private stakingModuleGuardService: StakingModuleGuardService,
    private guardianMessageService: GuardianMessageService,
    private guardianMetricsService: GuardianMetricsService,
  ) {}

  public async onModuleInit(): Promise<void> {
    // Does not wait for completion, to avoid blocking the app initialization
    (async () => {
      try {
        const block = await this.providerService.getBlock();
        const blockHash = block.hash;

        await Promise.all([
          this.depositService.initialize(block.number),
          this.securityService.initialize({ blockHash }),
        ]);

        // The event cache is stored with an N block lag to avoid caching data from uncle blocks
        // so we don't worry about blockHash here
        await this.depositService.updateEventsCache();

        this.subscribeToModulesUpdates();
      } catch (error) {
        this.logger.error(error);
        process.exit(1);
      }
    })();
  }

  /**
   * Subscribes to the staking router modules updates
   */
  public subscribeToModulesUpdates() {
    const cron = new CronJob(GUARDIAN_DEPOSIT_JOB_DURATION, () => {
      this.handleNewBlock().catch((error) => {
        this.logger.error(error);
      });
    });

    this.logger.log('GuardianService subscribed to Ethereum events');

    cron.start();

    this.schedulerRegistry.addCronJob(GUARDIAN_DEPOSIT_JOB_NAME, cron);
  }

  /**
   * Handles the appearance of a new block in the network
   */
  @OneAtTime()
  public async handleNewBlock(): Promise<void> {
    this.logger.log('New staking router state cycle start');

    const {
      elBlockSnapshot: { blockHash, blockNumber },
      data: stakingModules,
    } = await this.stakingRouterService.getStakingModules();

    if (
      !this.blockGuardService.isNeedToProcessNewState({
        blockHash,
        blockNumber,
      })
    )
      return;

    await this.depositService.handleNewBlock(blockNumber);

    const blockData = await this.blockGuardService.getCurrentBlockData({
      blockHash,
      blockNumber,
    });

    await Promise.all(
      stakingModules.map(async (stakingRouterModule) => {
        const stakingModuleData =
          await this.stakingModuleGuardService.getStakingRouterModuleData(
            stakingRouterModule,
            blockHash,
          );

        await this.stakingModuleGuardService.checkKeysIntersections(
          stakingModuleData,
          blockData,
        );

        this.guardianMetricsService.collectMetrics(
          stakingModuleData,
          blockData,
        );
      }),
    );

    await this.guardianMessageService.pingMessageBroker(
      stakingModules.map(({ id }) => id),
      blockData,
    );

    this.blockGuardService.setLastProcessedStateMeta({
      blockHash,
      blockNumber,
    });

    this.logger.log('New staking router state cycle end');
  }
}
