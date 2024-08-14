import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { StakingModuleData, BlockData } from 'guardian';
import { getVettedUnusedKeys } from './vetted-keys';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { Meta } from 'keys-api/interfaces/Meta';
import { SROperatorListWithModule } from 'keys-api/interfaces/SROperatorListWithModule';
import { SecurityService } from 'contracts/security';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';
import { KeysDuplicationCheckerService } from 'guardian/duplicates';
import { GuardianMetricsService } from 'guardian/guardian-metrics';

type State = {
  operatorsByModules: SROperatorListWithModule[];
  meta: Meta;
  lidoKeys: RegistryKey[];
  blockData: BlockData;
};

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private securityService: SecurityService,
    private stakingModuleGuardService: StakingModuleGuardService,
    private keysDuplicationCheckerService: KeysDuplicationCheckerService,
    private guardianMetricsService: GuardianMetricsService,
  ) {}

  /**
   * Collects basic data about the staking module, including activity status, vetted unused keys list, ID, address, and nonce.
   */
  public async collectStakingModuleData({
    operatorsByModules,
    meta,
    lidoKeys,
    blockData,
  }: State): Promise<StakingModuleData[]> {
    return await Promise.all(
      operatorsByModules.map(async ({ operators, module: stakingModule }) => {
        const unusedKeys = lidoKeys.filter(
          (key) =>
            !key.used &&
            key.moduleAddress === stakingModule.stakingModuleAddress,
        );

        const moduleVettedUnusedKeys = getVettedUnusedKeys(
          operators,
          unusedKeys,
        );

        // check pause
        const isModuleDepositsPaused =
          await this.securityService.isModuleDepositsPaused(stakingModule.id, {
            blockHash: blockData.blockHash,
          });

        return {
          isModuleDepositsPaused,
          nonce: stakingModule.nonce,
          stakingModuleId: stakingModule.id,
          stakingModuleAddress: stakingModule.stakingModuleAddress,
          blockHash: blockData.blockHash,
          lastChangedBlockHash: meta.elBlockSnapshot.lastChangedBlockHash,
          vettedUnusedKeys: moduleVettedUnusedKeys,
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
    lidoKeys: RegistryKey[],
    blockData: BlockData,
  ): Promise<void> {
    const { duplicates, unresolved } =
      await this.keysDuplicationCheckerService.getDuplicatedKeys(
        lidoKeys,
        blockData,
      );

    await Promise.all(
      stakingModulesData.map(async (stakingModuleData) => {
        stakingModuleData.frontRunKeys =
          this.stakingModuleGuardService.getFrontRunAttempts(
            stakingModuleData,
            blockData,
          );
        stakingModuleData.invalidKeys =
          await this.stakingModuleGuardService.getInvalidKeys(
            stakingModuleData,
            blockData,
          );
        const allDuplicatedKeys = this.getModuleKeys(
          stakingModuleData.stakingModuleAddress,
          duplicates,
        );
        stakingModuleData.duplicatedKeys = this.getVettedUnusedKeys(
          stakingModuleData.vettedUnusedKeys,
          allDuplicatedKeys,
        );

        const allUnresolved = this.getModuleKeys(
          stakingModuleData.stakingModuleAddress,
          unresolved,
        );

        stakingModuleData.unresolvedDuplicatedKeys = this.getVettedUnusedKeys(
          stakingModuleData.vettedUnusedKeys,
          allUnresolved,
        );

        this.guardianMetricsService.collectDuplicatedKeysMetrics(
          stakingModuleData.stakingModuleId,
          allUnresolved.length,
          stakingModuleData.unresolvedDuplicatedKeys.length,
          allDuplicatedKeys.length,
          stakingModuleData.duplicatedKeys.length,
        );

        this.guardianMetricsService.collectInvalidKeysMetrics(
          stakingModuleData.stakingModuleId,
          stakingModuleData.invalidKeys.length,
        );

        this.logger.log('Keys check state', {
          stakingModuleId: stakingModuleData.stakingModuleId,
          frontRunAttempt: stakingModuleData.frontRunKeys.length,
          invalid: stakingModuleData.invalidKeys.length,
          duplicated: stakingModuleData.duplicatedKeys.length,
          unresolvedDuplicated:
            stakingModuleData.unresolvedDuplicatedKeys.length,
          blockNumber: blockData.blockNumber,
        });
      }),
    );
  }

  private getModuleKeys(stakingModuleAddress: string, keys: RegistryKey[]) {
    return keys.filter((key) => key.moduleAddress === stakingModuleAddress);
  }

  /**
   * filter from the list all keys that are not vetted as unused
   */
  public getVettedUnusedKeys(
    vettedUnusedKeys: RegistryKey[],
    keys: RegistryKey[],
  ) {
    const vettedUnused = keys.filter((key) => {
      const r = vettedUnusedKeys.some(
        (k) => k.index == key.index && k.operatorIndex == key.operatorIndex,
      );

      return r;
    });

    return vettedUnused;
  }
}
