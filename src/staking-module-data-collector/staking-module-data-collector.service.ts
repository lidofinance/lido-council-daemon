import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { StakingModuleData, BlockData } from 'guardian';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';
import { KeysDuplicationCheckerService } from 'guardian/duplicates';
import { GuardianMetricsService } from 'guardian/guardian-metrics';
import { StakingRouterService } from 'contracts/staking-router';
import { SRModule } from 'keys-api/interfaces';
import { ELBlockSnapshot } from 'keys-api/interfaces/ELBlockSnapshot';
import { METRIC_JOB_DURATION } from 'common/prometheus';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { DeepReadonly } from 'common/ts-utils';

type State = {
  stakingModules: SRModule[];
  meta: ELBlockSnapshot;
  lidoKeys: DeepReadonly<RegistryKey[]>;
};

@Injectable()
export class StakingModuleDataCollectorService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private stakingModuleGuardService: StakingModuleGuardService,
    private keysDuplicationCheckerService: KeysDuplicationCheckerService,
    private guardianMetricsService: GuardianMetricsService,
    private stakingRouterService: StakingRouterService,
    @InjectMetric(METRIC_JOB_DURATION)
    private jobDurationMetric: Histogram<string>,
  ) {}

  /**
   * Collects basic data about the staking module, including activity status, vetted unused keys list, ID, address, and nonce.
   */
  public async collectStakingModuleData({
    stakingModules,
    meta,
    lidoKeys,
  }: State): Promise<StakingModuleData[]> {
    return await Promise.all(
      stakingModules.map(async (stakingModule) => {
        return {
          isModuleDepositsPaused:
            await this.stakingRouterService.isModuleDepositsPaused(
              stakingModule.id,
              {
                blockHash: meta.blockHash,
              },
            ),
          nonce: stakingModule.nonce,
          stakingModuleId: stakingModule.id,
          stakingModuleAddress: stakingModule.stakingModuleAddress,
          blockHash: meta.blockHash,
          lastChangedBlockHash: meta.lastChangedBlockHash,
          vettedUnusedKeys: this.getModuleVettedUnusedKeys(
            stakingModule.stakingModuleAddress,
            lidoKeys,
          ),
          duplicatedKeys: [],
          invalidKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
        };
      }),
    );
  }

  /**
   * Check for duplicated, invalid, and front-run attempts
   */
  public async checkKeys(
    stakingModulesData: StakingModuleData[],
    lidoKeys: DeepReadonly<RegistryKey[]>,
    blockData: BlockData,
  ): Promise<void> {
    const endTimerDuplicates = this.jobDurationMetric
      .labels({ jobName: 'duplicates' })
      .startTimer();

    const { duplicates, unresolved } =
      await this.keysDuplicationCheckerService.getDuplicatedKeys(
        lidoKeys,
        blockData,
      );

    endTimerDuplicates();

    await Promise.all(
      stakingModulesData.map(async (stakingModuleData) => {
        // identify keys that were front-run withing vetted unused keys
        stakingModuleData.frontRunKeys =
          this.stakingModuleGuardService.getFrontRunAttempts(
            stakingModuleData,
            blockData,
          );

        const endTimerValidation = this.jobDurationMetric
          .labels({
            jobName: 'validation',
            stakingModuleId: stakingModuleData.stakingModuleId,
          })
          .startTimer();

        // identify keys with invalid signatures within vetted unused keys
        stakingModuleData.invalidKeys =
          await this.stakingModuleGuardService.getInvalidKeys(
            stakingModuleData,
            blockData,
          );
        endTimerValidation();

        // Filter all keys for the module to get the total number of duplicated keys,
        // for Prometheus metrics
        const allModuleDuplicatedKeys = this.getModuleKeys(
          stakingModuleData.stakingModuleAddress,
          duplicates,
        );
        // Filter vetted and unused duplicated keys for the module
        stakingModuleData.duplicatedKeys = this.getModuleVettedUnusedKeys(
          stakingModuleData.stakingModuleAddress,
          duplicates,
        );

        // Filter all unresolved keys (keys without a SigningKeyAdded event) for the module,
        // including both vetted and unvetted keys, to show the total count of unresolved keys
        // for Prometheus metrics
        const allModuleUnresolved = this.getModuleKeys(
          stakingModuleData.stakingModuleAddress,
          unresolved,
        );
        // Filter vetted and unused duplicated keys for the module
        stakingModuleData.unresolvedDuplicatedKeys =
          this.getModuleVettedUnusedKeys(
            stakingModuleData.stakingModuleAddress,
            unresolved,
          );

        this.collectModuleMetric(
          stakingModuleData,
          allModuleUnresolved,
          stakingModuleData.unresolvedDuplicatedKeys,
          allModuleDuplicatedKeys,
          stakingModuleData.duplicatedKeys,
        );

        this.logKeysCheckState(stakingModuleData);
      }),
    );
  }

  private collectModuleMetric(
    stakingModuleData: StakingModuleData,
    unresolvedKeys: RegistryKey[],
    vettedUnusedUnresolvedKeys: RegistryKey[],
    duplicatedKeys: RegistryKey[],
    vettedUnusedDuplcaitedKeys: RegistryKey[],
  ) {
    const { invalidKeys, stakingModuleId } = stakingModuleData;

    // Collect metrics for unresolved and duplicated keys in the staking module:
    // - Total unresolved keys (keys without a corresponding SigningKeyAdded event)
    // - Subset of unresolved keys that are vetted and unused
    // - Total duplicated keys
    // - Subset of duplicated keys that are vetted and unused
    this.guardianMetricsService.collectDuplicatedKeysMetrics(
      stakingModuleId,
      unresolvedKeys.length,
      vettedUnusedUnresolvedKeys.length,
      duplicatedKeys.length,
      vettedUnusedDuplcaitedKeys.length,
    );

    // Collect metrics for the total number of vetted unused keys with invalid signatures within the staking module
    this.guardianMetricsService.collectInvalidKeysMetrics(
      stakingModuleId,
      invalidKeys.length,
    );
  }

  private logKeysCheckState(stakingModuleData: StakingModuleData) {
    const {
      stakingModuleId,
      blockHash,
      frontRunKeys,
      invalidKeys,
      duplicatedKeys,
      unresolvedDuplicatedKeys,
    } = stakingModuleData;
    this.logger.log('Keys check state', {
      stakingModuleId: stakingModuleId,
      frontRunAttempt: frontRunKeys.length,
      invalid: invalidKeys.length,
      duplicated: duplicatedKeys.length,
      unresolvedDuplicated: unresolvedDuplicatedKeys.length,
      blockHash: blockHash,
    });
  }

  private getModuleKeys(stakingModuleAddress: string, keys: RegistryKey[]) {
    return keys.filter((key) => key.moduleAddress === stakingModuleAddress);
  }

  private getModuleVettedUnusedKeys(
    stakingModuleAddress: string,
    lidoKeys: DeepReadonly<RegistryKey[]>,
  ) {
    const vettedUnusedKeys = lidoKeys.filter(
      (key) =>
        !key.used && key.vetted && key.moduleAddress === stakingModuleAddress,
    );

    return vettedUnusedKeys;
  }
}
