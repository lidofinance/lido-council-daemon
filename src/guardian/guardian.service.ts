import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { compare } from 'compare-versions';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DepositService } from 'contracts/deposit';
import { SecurityService } from 'contracts/security';
import { RepositoryService } from 'contracts/repository';
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
import { StakingModuleData } from './interfaces';
import { ProviderService } from 'provider';
import { KeysApiService } from 'keys-api/keys-api.service';
import { MIN_KAPI_VERSION } from './guardian.constants';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';

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
    private stakingRouterService: StakingRouterService,

    private blockGuardService: BlockGuardService,
    private stakingModuleGuardService: StakingModuleGuardService,
    private guardianMessageService: GuardianMessageService,
    private guardianMetricsService: GuardianMetricsService,

    private providerService: ProviderService,
    private keysApiService: KeysApiService,
    private signingKeyEventsCacheService: SigningKeyEventsCacheService,
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
          this.signingKeyEventsCacheService.initialize(block.number),
        ]);

        const chainId = await this.providerService.getChainId();
        const keysApiStatus = await this.keysApiService.getKeysApiStatus();

        if (chainId !== keysApiStatus.chainId) {
          this.logger.warn('Wrong KAPI chainId', {
            chainId,
            keysApiChainId: keysApiStatus.chainId,
          });
          throw new Error(
            'The ChainId in KeysAPI must match the ChainId in EL Node',
          );
        }

        if (!compare(keysApiStatus.appVersion, MIN_KAPI_VERSION, '>=')) {
          this.logger.warn('Wrong KAPI version', {
            minKAPIVersion: MIN_KAPI_VERSION,
            keysApiVersion: keysApiStatus.appVersion,
          });
          throw new Error(
            `The KAPI version must be greater than or equal to ${MIN_KAPI_VERSION}`,
          );
        }

        // The event cache is stored with an N block lag to avoid caching data from uncle blocks
        // so we don't worry about blockHash here
        await this.depositService.updateEventsCache();
        await this.signingKeyEventsCacheService.updateEventsCache();

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
      const { data: operatorsByModules, meta } =
        await this.keysApiService.getOperatorListWithModule();

      const {
        elBlockSnapshot: { blockHash, blockNumber },
      } = meta;

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

      const stakingModulesCount = operatorsByModules.length;

      this.logger.log('Staking modules loaded', {
        modulesCount: stakingModulesCount,
      });

      // fetch all lido keys
      const { data: lidoKeys, meta: currMeta } =
        await this.keysApiService.getKeys();

      // as we fetch at first operators to define vetted keys
      // and now fetched keys , dat in Keys API could change since those moment and we
      this.stakingRouterService.isEqualLastChangedBlockHash(
        meta.elBlockSnapshot.lastChangedBlockHash,
        currMeta.elBlockSnapshot.lastChangedBlockHash,
      );

      await this.depositService.handleNewBlock(blockNumber);
      await this.signingKeyEventsCacheService.handleNewBlock(blockNumber);

      const blockData = await this.blockGuardService.getCurrentBlockData({
        blockHash,
        blockNumber,
      });

      this.logger.debug?.('Current block data loaded', {
        guardianIndex: blockData.guardianIndex,
        blockNumber: blockData.blockNumber,
        blockHash: blockData.blockHash,
      });

      // TODO: add metrics for getHistoricalFrontRun same as for keysIntersections
      const theftHappened =
        await this.stakingModuleGuardService.getHistoricalFrontRun(blockData);

      const stakingModulesData: StakingModuleData[] =
        await this.stakingRouterService.getStakingModulesData({
          operatorsByModules,
          meta,
          lidoKeys,
          blockData,
        });

      const version = await this.securityService.version({
        blockHash: blockData.blockHash,
      });

      this.logger.log('DSM contract version:', { version });

      const alreadyPausedDeposits =
        await this.stakingModuleGuardService.alreadyPausedDeposits(
          blockData,
          version,
        );

      if (alreadyPausedDeposits) {
        this.logger.warn('Deposits are already paused', {
          blockNumber: blockData.blockNumber,
        });
      }

      if (version === 3 && !alreadyPausedDeposits && theftHappened) {
        await this.stakingModuleGuardService.handlePauseV3(blockData);
      } else if (theftHappened) {
        await this.stakingModuleGuardService.handlePauseV2(
          stakingModulesData,
          blockData,
        );
      }

      await Promise.all(
        stakingModulesData.map(async (stakingModuleData) => {
          await this.stakingModuleGuardService.handleUnvetting(
            stakingModuleData,
            blockData,
            version,
          );

          this.guardianMetricsService.collectMetrics(
            stakingModuleData,
            blockData,
          );

          if (
            !this.stakingModuleGuardService.canDeposit(
              stakingModuleData,
              theftHappened,
              alreadyPausedDeposits,
            )
          ) {
            this.logger.warn('Module is on soft pause', {
              stakingModuleId: stakingModuleData.stakingModuleId,
            });
            return;
          }

          await this.stakingModuleGuardService.handleCorrectKeys(
            stakingModuleData,
            blockData,
          );
        }),
      );

      await this.guardianMessageService.pingMessageBroker(
        stakingModulesData.map(({ stakingModuleId }) => stakingModuleId),
        blockData,
      );

      this.blockGuardService.setLastProcessedStateMeta({
        blockHash,
        blockNumber,
      });
    } catch (error) {
      this.logger.error('Staking router state update error');
      this.logger.error(error);
    } finally {
      this.logger.log('New staking router state cycle end');
    }
  }
}
