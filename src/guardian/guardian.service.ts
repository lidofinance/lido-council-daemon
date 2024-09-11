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
import { StakingModuleDataCollectorService } from 'staking-module-data-collector';

import { BlockDataCollectorService } from './block-data-collector';

import { StakingModuleGuardService } from './staking-module-guard';
import { GuardianMessageService } from './guardian-message';
import { GuardianMetricsService } from './guardian-metrics';
import { BlockData, StakingModuleData } from './interfaces';
import { ProviderService } from 'provider';
import { KeysApiService } from 'keys-api/keys-api.service';
import { MIN_KAPI_VERSION } from './guardian.constants';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';
import { UnvettingService } from './unvetting/unvetting.service';
import { Meta } from 'keys-api/interfaces/Meta';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { SROperatorListWithModule } from 'keys-api/interfaces/SROperatorListWithModule';
import { StakingRouterService } from 'contracts/staking-router';

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
    private stakingModuleDataCollectorService: StakingModuleDataCollectorService,

    private blockDataCollectorService: BlockDataCollectorService,
    private stakingModuleGuardService: StakingModuleGuardService,
    private guardianMessageService: GuardianMessageService,
    private guardianMetricsService: GuardianMetricsService,

    private providerService: ProviderService,
    private keysApiService: KeysApiService,
    private signingKeyEventsCacheService: SigningKeyEventsCacheService,

    private unvettingService: UnvettingService,

    private stakingRouterService: StakingRouterService,
  ) {}

  public async onModuleInit(): Promise<void> {
    // Does not wait for completion, to avoid blocking the app initialization
    (async () => {
      try {
        // potentially very long await
        const block = await this.repositoryService.initOrWaitCachedContracts();
        const blockHash = block.hash;

        const stakingRouterModuleAddresses =
          await this.stakingRouterService.getStakingModulesAddresses(blockHash);

        await Promise.all([
          this.depositService.initialize(block.number),
          this.securityService.initialize({ blockHash }),
          this.signingKeyEventsCacheService.initialize(
            block.number,
            stakingRouterModuleAddresses,
          ),
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
        await this.signingKeyEventsCacheService.updateEventsCache(
          stakingRouterModuleAddresses,
        );

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
      // Fetch the minimum required data fro Keys Api to make an early exit
      const { data: operatorsByModules, meta: firstRequestMeta } =
        await this.keysApiService.getOperatorListWithModule();

      const {
        elBlockSnapshot: { blockHash, blockNumber },
      } = firstRequestMeta;

      // Compare the block stored in memory from the previous iteration with the current block from the Keys API.
      const isNewBlock = this.isNeedToProcessNewState({
        blockHash,
        blockNumber,
      });

      if (!isNewBlock) return;

      const stakingModulesCount = operatorsByModules.length;

      this.logger.log('Staking modules loaded', {
        modulesCount: stakingModulesCount,
      });

      // fetch all lido keys
      const { data: lidoKeys, meta: secondRequestMeta } =
        await this.keysApiService.getKeys();

      // check that there were no updates in Keys Api between two requests
      this.keysApiService.verifyMetaDataConsistency(
        firstRequestMeta.elBlockSnapshot.lastChangedBlockHash,
        secondRequestMeta.elBlockSnapshot.lastChangedBlockHash,
      );

      // contracts initialization
      await this.repositoryService.initCachedContracts({ blockHash });

      await this.depositService.handleNewBlock(blockNumber);

      const { stakingModulesData, blockData } = await this.collectData(
        operatorsByModules,
        firstRequestMeta,
        lidoKeys,
      );

      if (
        blockData.securityVersion === 3 &&
        !blockData.alreadyPausedDeposits &&
        blockData.theftHappened
      ) {
        await this.stakingModuleGuardService.handlePauseV3(blockData);
        return;
      }

      if (blockData.securityVersion !== 3 && blockData.theftHappened) {
        await this.stakingModuleGuardService.handlePauseV2(
          stakingModulesData,
          blockData,
        );
        return;
      }

      // To avoid blocking the pause, run the following tasks asynchronously:
      // updating the SigningKeyAdded events cache, checking keys, handling the unvetting of keys,
      // and sending deposit messages to the queue.
      this.handleKeys(stakingModulesData, blockData, lidoKeys).catch(
        this.logger.error,
      );

      await this.guardianMessageService.pingMessageBroker(
        stakingModulesData.map(({ stakingModuleId }) => stakingModuleId),
        blockData,
      );
    } catch (error) {
      this.logger.error('Staking router state update error');
      this.logger.error(error);
    }
  }

  private async collectData(
    operatorsByModules: SROperatorListWithModule[],
    meta: Meta,
    lidoKeys: RegistryKey[],
  ) {
    const {
      elBlockSnapshot: { blockHash, blockNumber },
    } = meta;

    const [blockData, stakingModulesData] = await Promise.all([
      this.blockDataCollectorService.getCurrentBlockData({
        blockHash,
        blockNumber,
      }),
      // Construct the Staking Module data array using information fetched from the Keys API,
      // identifying vetted unused keys and checking the module pause status
      this.stakingModuleDataCollectorService.collectStakingModuleData({
        operatorsByModules,
        meta,
        lidoKeys,
      }),
    ]);

    this.logger.debug?.('Current block data loaded', {
      guardianIndex: blockData.guardianIndex,
      blockNumber: blockNumber,
      blockHash: blockHash,
      securityVersion: blockData.securityVersion,
    });

    return { blockData, stakingModulesData };
  }

  /**
   * This method check keys and if they are correct send deposit message in queue, another way send unvet transaction
   */
  @OneAtTime()
  private async handleKeys(
    stakingModulesData: StakingModuleData[],
    blockData: BlockData,
    lidoKeys: RegistryKey[],
  ) {
    // check lido keys
    await this.checkKeys(stakingModulesData, blockData, lidoKeys);
    // unvet keys if need
    await this.handleUnvetting(stakingModulesData, blockData);
    await this.handleDeposit(stakingModulesData, blockData);

    const { blockHash, blockNumber } = blockData;
    this.setLastProcessedStateMeta({
      blockHash,
      blockNumber,
    });

    this.logger.log('New staking router state cycle end');
  }

  private async checkKeys(
    stakingModulesData: StakingModuleData[],
    blockData: BlockData,
    lidoKeys: RegistryKey[],
  ) {
    const stakingRouterModuleAddresses = stakingModulesData.map(
      (stakingModule) => stakingModule.stakingModuleAddress,
    );
    // update cache if needs
    await this.signingKeyEventsCacheService.handleNewBlock(
      blockData.blockNumber,
      stakingRouterModuleAddresses,
    );

    // check keys on duplicates, attempts of front-run and check signatures
    await this.stakingModuleDataCollectorService.checkKeys(
      stakingModulesData,
      lidoKeys,
      blockData,
    );
  }

  private async handleUnvetting(
    stakingModulesData: StakingModuleData[],
    blockData: BlockData,
  ) {
    if (blockData.securityVersion !== 3) {
      return;
    }

    const firstInvalidModule = this.findFirstInvalidModule(stakingModulesData);

    if (!firstInvalidModule) {
      this.logger.log(
        'Keys of all modules are correct. No need in unvetting.',
        {
          blockHash: blockData.blockHash,
        },
      );
      return;
    }

    await this.unvettingService.handleUnvetting(firstInvalidModule, blockData);
  }

  private findFirstInvalidModule(
    stakingModulesData: StakingModuleData[],
  ): StakingModuleData | undefined {
    return stakingModulesData.find((moduleData) =>
      this.hasInvalidKeys(moduleData),
    );
  }

  private hasInvalidKeys(moduleData: StakingModuleData): boolean {
    const keys = moduleData.invalidKeys.concat(
      moduleData.duplicatedKeys,
      moduleData.frontRunKeys,
    );
    return keys.length > 0;
  }

  private async handleDeposit(
    stakingModulesData: StakingModuleData[],
    blockData: BlockData,
  ) {
    // Check the integrity of the cache, we can only make a deposit
    // if the integrity of the deposit event data is intact
    await blockData.depositedEvents.checkRoot();

    await Promise.all(
      stakingModulesData.map(async (stakingModuleData) => {
        this.guardianMetricsService.collectMetrics(
          stakingModuleData,
          blockData,
        );

        if (
          this.cannotDeposit(
            stakingModuleData,
            blockData.theftHappened,
            blockData.alreadyPausedDeposits,
          )
        ) {
          this.logger.warn('Deposits are not available', {
            stakingModuleId: stakingModuleData.stakingModuleId,
            blockHash: blockData.blockHash,
          });
          return;
        }

        await this.stakingModuleGuardService.handleCorrectKeys(
          stakingModuleData,
          blockData,
        );
      }),
    );
  }

  private cannotDeposit(
    stakingModuleData: StakingModuleData,
    theftHappened: boolean,
    alreadyPausedDeposits: boolean,
  ): boolean {
    const keysForUnvetting = stakingModuleData.invalidKeys.concat(
      stakingModuleData.frontRunKeys,
      stakingModuleData.duplicatedKeys,
    );

    // if neither of this conditions is true, deposits are allowed for module
    return (
      keysForUnvetting.length > 0 ||
      stakingModuleData.unresolvedDuplicatedKeys.length > 0 ||
      alreadyPausedDeposits ||
      theftHappened ||
      stakingModuleData.isModuleDepositsPaused
    );
  }

  public isNeedToProcessNewState(newMeta: {
    blockHash: string;
    blockNumber: number;
  }) {
    const lastMeta = this.lastProcessedStateMeta;
    if (!lastMeta) return true;
    if (lastMeta.blockNumber > newMeta.blockNumber) {
      this.logger.error('Keys API returns old state', { newMeta, lastMeta });
      return false;
    }
    const isSameBlock = lastMeta.blockHash === newMeta.blockHash;

    if (isSameBlock) {
      this.logger.log(`The block has not changed since the last cycle. Exit`, {
        newMeta,
      });
    }

    return !isSameBlock;
  }

  private setLastProcessedStateMeta(newMeta: {
    blockHash: string;
    blockNumber: number;
  }) {
    this.lastProcessedStateMeta = newMeta;
  }
}
