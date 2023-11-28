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
import { RepositoryService } from 'contracts/repository';
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
import { UnusedKeysValidationService } from './unused-keys-validation/unused-keys-validation.service';
import { MultithreadedUnusedKeysValidationService } from './unused-keys-validation/multithread-keys-validation.service';
import { LidoService } from 'contracts/lido';

@Injectable()
export class GuardianService implements OnModuleInit {
  protected lastProcessedStateMeta?: { blockHash: string; blockNumber: number };

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,
    private repositoryService: RepositoryService,

    private schedulerRegistry: SchedulerRegistry,

    private depositService: DepositService,
    private securityService: SecurityService,
    private providerService: ProviderService,

    private stakingRouterService: StakingRouterService,

    private blockGuardService: BlockGuardService,
    private stakingModuleGuardService: StakingModuleGuardService,
    // private guardianMessageService: GuardianMessageService,
    private guardianMetricsService: GuardianMetricsService,
    private unusedKeysValidationService: MultithreadedUnusedKeysValidationService,
    private lidoService: LidoService,
  ) {}

  public async onModuleInit(): Promise<void> {
    // Does not wait for completion, to avoid blocking the app initialization
    (async () => {
      try {
        // potentially very long await
        const block = await this.repositoryService.initOrWaitCachedContracts();
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

    try {
      // TODO: rename
      const { blockHash, blockNumber, vettedKeys, stakingModulesData } =
        await this.stakingRouterService.getVettedAndUnusedKeys();

      const lidoWC = await this.lidoService.getWithdrawalCredentials({
        blockHash,
      });

      await this.unusedKeysValidationService.validateAndCacheList(
        lidoWC,
        vettedKeys,
      );

      await this.repositoryService.initCachedContracts({ blockHash });

      if (
        !this.blockGuardService.isNeedToProcessNewState({
          blockHash,
          blockNumber,
        })
      ) {
        this.logger.debug?.(
          `The block has not changed since the last cycle. Exit`,
          {
            blockHash,
            blockNumber,
          },
        );
        return;
      }

      const stakingModulesNumber = stakingModulesData.length;

      this.logger.log('Staking modules loaded', {
        modulesCount: stakingModulesNumber,
      });

      await this.depositService.handleNewBlock(blockNumber);

      const blockData = await this.blockGuardService.getCurrentBlockData({
        blockHash,
        blockNumber,
      });

      this.logger.debug?.('Current block data loaded', {
        guardianIndex: blockData.guardianIndex,
        blockNumber: blockData.blockNumber,
        blockHash: blockData.blockHash,
      });

      // maybe check only if one of nonce changed
      await this.stakingModuleGuardService.checkVettedKeysDuplicates(
        vettedKeys,
        blockData,
      );

      await Promise.all(
        stakingModulesData.map(async (stakingModuleData) => {
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

      // console.log('ping!!!!!!!!!');
      // await this.guardianMessageService.pingMessageBroker(
      //   stakingModulesData.map(({ stakingModuleId }) => stakingModuleId),
      //   blockData,
      // );

      this.blockGuardService.setLastProcessedStateMeta({
        blockHash,
        blockNumber,
      });
    } catch (error) {
      this.logger.error('Staking router state update error', error);
    } finally {
      this.logger.log('New staking router state cycle end');
    }
  }
}
