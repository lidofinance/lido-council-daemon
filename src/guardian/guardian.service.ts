import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { compare } from 'compare-versions';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DepositRegistryService } from 'contracts/deposits-registry';
import { SecurityService } from 'contracts/security';
import { RepositoryService } from 'contracts/repository';
import {
  GUARDIAN_DEPOSIT_JOB_DURATION_MS,
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
import {
  MIN_KAPI_VERSION,
  GUARDIAN_PING_BLOCKS_PERIOD,
} from './guardian.constants';
import { UnvettingService } from './unvetting/unvetting.service';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { StakingRouterService } from 'contracts/staking-router';
import { ELBlockSnapshot } from 'keys-api/interfaces/ELBlockSnapshot';
import { SRModule } from 'keys-api/interfaces';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { METRIC_JOB_DURATION } from 'common/prometheus';
import { Histogram } from 'prom-client';
import { DeepReadonly } from 'common/ts-utils';

@Injectable()
export class GuardianService implements OnModuleInit {
  protected lastProcessedStateMeta?: { blockHash: string; blockNumber: number };
  private lastPingBlock?: number;
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,
    private repositoryService: RepositoryService,

    private schedulerRegistry: SchedulerRegistry,

    private depositService: DepositRegistryService,
    private securityService: SecurityService,
    private stakingModuleDataCollectorService: StakingModuleDataCollectorService,

    private blockDataCollectorService: BlockDataCollectorService,
    private stakingModuleGuardService: StakingModuleGuardService,
    private guardianMessageService: GuardianMessageService,
    private guardianMetricsService: GuardianMetricsService,

    private providerService: ProviderService,
    private keysApiService: KeysApiService,
    private signingKeysRegistryService: SigningKeysRegistryService,

    private unvettingService: UnvettingService,

    private stakingRouterService: StakingRouterService,

    @InjectMetric(METRIC_JOB_DURATION)
    private jobDurationMetric: Histogram<string>,
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
          this.depositService.initialize(),
          this.securityService.initialize({ blockHash }),
          this.signingKeysRegistryService.initialize(
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
    const interval = setInterval(
      () => this.handleNewBlock().catch((error) => this.logger.error(error)),
      GUARDIAN_DEPOSIT_JOB_DURATION_MS,
    );

    this.schedulerRegistry.addInterval(GUARDIAN_DEPOSIT_JOB_NAME, interval);

    this.logger.log('GuardianService subscribed to Ethereum events');
  }

  /**
   * Handles the appearance of a new block in the network
   */
  @OneAtTime()
  public async handleNewBlock(): Promise<void> {
    this.logger.log('Beginning of the processing of the new Guardian cycle');

    try {
      const endTimer = this.jobDurationMetric
        .labels({ jobName: 'handleNewBlock' })
        .startTimer();

      // Fetch the minimum required data fro Keys Api to make an early exit
      const { data: stakingModules, elBlockSnapshot: firstRequestMeta } =
        await this.keysApiService.getModules();

      const { blockHash, blockNumber } = firstRequestMeta;

      // Compare the block stored in memory from the previous iteration with the current block from the Keys API.
      const isNewBlock = this.isNeedToProcessNewState({
        blockHash,
        blockNumber,
      });

      if (!isNewBlock) return;

      const stakingModulesCount = stakingModules.length;

      this.logger.log('Staking modules loaded', {
        modulesCount: stakingModulesCount,
      });

      const endTimerKeysReq = this.jobDurationMetric
        .labels({ jobName: 'keysReq' })
        .startTimer();

      // fetch all lido keys
      const { data: lidoKeys } = await this.keysApiService.getKeys(
        firstRequestMeta,
      );

      endTimerKeysReq();

      // contracts initialization
      await this.repositoryService.initCachedContracts({ blockHash });

      await this.depositService.handleNewBlock();

      const { stakingModulesData, blockData } = await this.collectData(
        stakingModules,
        firstRequestMeta,
        lidoKeys,
      );

      if (!blockData.alreadyPausedDeposits && blockData.theftHappened) {
        await this.stakingModuleGuardService.handlePauseV3(blockData);
        return;
      }

      // To avoid blocking the pause due to a potentially lengthy SigningKeyAdded
      // events cache update, which can occur when the modules list changes:
      // run key checks and send deposit messages to the queue without waiting.
      this.handleKeys(stakingModulesData, blockData, lidoKeys)
        .catch(this.logger.error)
        .finally(() => {
          this.logger.log(
            'End of unvetting and deposits processing by Guardian',
          );
          endTimer();
        });
    } catch (error) {
      this.logger.error('Guardian cycle processing error');
      this.logger.error(error);
    } finally {
      this.logger.log('End of pause processing by Guardian');
    }
  }

  private async collectData(
    stakingModules: SRModule[],
    meta: ELBlockSnapshot,
    lidoKeys: DeepReadonly<RegistryKey[]>,
  ) {
    const { blockHash, blockNumber } = meta;

    const [blockData, stakingModulesData] = await Promise.all([
      this.blockDataCollectorService.getCurrentBlockData({
        blockHash,
        blockNumber,
      }),
      // Construct the Staking Module data array using information fetched from the Keys API,
      // identifying vetted unused keys and checking the module pause status
      this.stakingModuleDataCollectorService.collectStakingModuleData({
        stakingModules,
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
    lidoKeys: DeepReadonly<RegistryKey[]>,
  ) {
    // check lido keys
    await this.checkKeys(stakingModulesData, blockData, lidoKeys);
    // unvet keys if need
    await this.handleUnvetting(stakingModulesData, blockData);
    await this.handleDeposit(stakingModulesData, blockData);

    const { blockHash, blockNumber } = blockData;

    if (
      !this.lastPingBlock ||
      this.lastPingBlock + GUARDIAN_PING_BLOCKS_PERIOD <= blockNumber
    ) {
      this.lastPingBlock = blockNumber;
      this.guardianMessageService
        .pingMessageBroker(
          stakingModulesData.map(({ stakingModuleId }) => stakingModuleId),
          blockData,
        )
        .catch((error) => this.logger.error(error));
    }

    this.setLastProcessedStateMeta({
      blockHash,
      blockNumber,
    });
  }

  private async checkKeys(
    stakingModulesData: StakingModuleData[],
    blockData: BlockData,
    lidoKeys: DeepReadonly<RegistryKey[]>,
  ) {
    const stakingRouterModuleAddresses = stakingModulesData.map(
      (stakingModule) => stakingModule.stakingModuleAddress,
    );
    // update cache if needs
    await this.signingKeysRegistryService.handleNewBlock(
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
    await Promise.all(
      stakingModulesData.map(async (stakingModuleData) => {
        this.guardianMetricsService.collectMetrics(
          stakingModuleData,
          blockData,
        );

        if (
          this.ignoreDeposits(
            stakingModuleData,
            blockData.theftHappened,
            blockData.alreadyPausedDeposits,
            stakingModuleData.stakingModuleId,
          )
        ) {
          return;
        }

        await this.stakingModuleGuardService.handleCorrectKeys(
          stakingModuleData,
          blockData,
        );
      }),
    );
  }

  private ignoreDeposits(
    stakingModuleData: StakingModuleData,
    theftHappened: boolean,
    alreadyPausedDeposits: boolean,
    stakingModuleId: number,
  ): boolean {
    const keysForUnvetting = stakingModuleData.invalidKeys.concat(
      stakingModuleData.frontRunKeys,
      stakingModuleData.duplicatedKeys,
    );

    // if neither of this conditions is true, deposits are allowed for module
    const ignoreDeposits =
      keysForUnvetting.length > 0 ||
      stakingModuleData.unresolvedDuplicatedKeys.length > 0 ||
      alreadyPausedDeposits ||
      theftHappened ||
      stakingModuleData.isModuleDepositsPaused;

    if (ignoreDeposits) {
      this.logger.warn('Deposits are not available', {
        keysForUnvetting: keysForUnvetting.length,
        duplicates: stakingModuleData.unresolvedDuplicatedKeys.length,
        alreadyPausedDeposits,
        theftHappened,
        isModuleDepositsPaused: stakingModuleData.isModuleDepositsPaused,
        stakingModuleId,
      });
    }

    return ignoreDeposits;
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
