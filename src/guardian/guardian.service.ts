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

      // fetch all lido keys
      const { data: lidoKeys, meta: currMeta } =
        await this.keysApiService.getKeys();

      // as we fetch at first operators to define vetted keys
      // and now fetched keys , dat in Keys API could change since those moment and we
      this.stakingRouterService.isEqualLastChangedBlockHash(
        meta.elBlockSnapshot.lastChangedBlockHash,
        currMeta.elBlockSnapshot.lastChangedBlockHash,
      );

      const stakingModulesCount = operatorsByModules.length;

      this.logger.log('Staking modules loaded', {
        modulesCount: stakingModulesCount,
      });

      await this.depositService.handleNewBlock(blockNumber);

      // TODO: e2e test 'node operator deposit frontrun' shows that it is possible to find event and not save in cache
      const blockData = await this.blockGuardService.getCurrentBlockData({
        blockHash,
        blockNumber,
      });

      this.logger.debug?.('Current block data loaded', {
        guardianIndex: blockData.guardianIndex,
        blockNumber: blockData.blockNumber,
        blockHash: blockData.blockHash,
      });

      // will create something like StakingModuleData
      const stakingModulesData = await Promise.all(
        operatorsByModules.map(async ({ module: stakingModule }) => {
          const isDepositsPaused = await this.securityService.isDepositsPaused(
            stakingModule.id,
            {
              blockHash: blockHash,
            },
          );

          return {
            nonce: stakingModule.nonce,
            unusedKeys: lidoKeys
              .filter(
                (srKey) =>
                  srKey.moduleAddress == stakingModule.stakingModuleAddress,
              )
              .map((srKey) => srKey.key),
            isDepositsPaused,
            stakingModuleId: stakingModule.id,
            stakingModuleAddress: stakingModule.stakingModuleAddress,
            blockHash: meta.elBlockSnapshot.blockHash,
            lastChangedBlockHash: meta.elBlockSnapshot.lastChangedBlockHash,
          };
        }),
      );

      const modulesOnPause: number[] = [];

      // search for intersection of unused lido keys and deposited events
      await Promise.all(
        stakingModulesData.map(async (stakingModuleData) => {
          const foundIntersection =
            await this.stakingModuleGuardService.checkKeysIntersections(
              stakingModuleData,
              blockData,
            );

          if (stakingModuleData.isDepositsPaused) {
            this.logger.warn('Deposits are paused', {
              blockHash,
              stakingModuleData: stakingModuleData.stakingModuleId,
            });

            this.guardianMetricsService.collectMetrics(
              stakingModuleData,
              blockData,
            );

            modulesOnPause.push(stakingModuleData.stakingModuleId);

            return;
          }

          if (foundIntersection) {
            this.stakingModuleGuardService.handleKeysIntersections(
              stakingModuleData,
              blockData,
            );

            this.guardianMetricsService.collectMetrics(
              stakingModuleData,
              blockData,
            );
            modulesOnPause.push(stakingModuleData.stakingModuleId);

            return;
          }

          this.guardianMetricsService.collectMetrics(
            stakingModuleData,
            blockData,
          );
        }),
      );

      // for all modules frontrun was found or module is on pause
      if (modulesOnPause.length == stakingModulesData.length) {
        this.logger.log('All modules are on pause now');
        return;
      }

      // search for duplicated keys across all modules
      // vetted keys
      const operators = operatorsByModules
        .map(({ operators }) => operators)
        .flat();
      const vettedKeys = this.stakingRouterService.getVettedKeys(
        operators,
        lidoKeys,
      );
      // duplicated keys across all vetted keys
      const duplicates =
        this.stakingModuleGuardService.getDuplicatedKeys(vettedKeys);

      // search for invalid keys across vetted unused keys
      await Promise.all(
        stakingModulesData.map(async (stakingModuleData) => {
          // if module on pause skip deposits
          if (modulesOnPause.includes(stakingModuleData.stakingModuleId)) {
            return;
          }

          const moduleDuplicates = duplicates.filter((key) => {
            key.moduleAddress == stakingModuleData.stakingModuleAddress;
          });

          if (moduleDuplicates.length) {
            this.logger.log('Found duplicated keys', {
              stakingModuleId: stakingModuleData.stakingModuleId,
            });
            return;
          }

          // vetted unused keys for validation
          const vettedUnused = vettedKeys.filter((key) => {
            key.moduleAddress == stakingModuleData.stakingModuleAddress &&
              !key.used;
          });

          // found invalid keys
          const invalidKeys =
            await this.stakingModuleGuardService.getInvalidKeys(
              vettedUnused,
              stakingModuleData.stakingModuleId,
              blockData,
            );

          if (invalidKeys.length) {
            this.logger.log('Found invalid keys', {
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
