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
  ) {}

  /**
   * Return staking module data and block information
   */
  public async getStakingModulesData({
    operatorsByModules,
    meta,
    lidoKeys,
    blockData,
  }: State): Promise<StakingModuleData[]> {
    const stakingModulesData = await this.collectStakingModuleData({
      operatorsByModules,
      meta,
      lidoKeys,
      blockData,
    });
    await this.checkKeys(stakingModulesData, lidoKeys, blockData);

    return stakingModulesData;
  }

  /**
   * Collects basic data about the staking module, including activity status, vetted unused keys list, ID, address, and nonce.
   */
  private async collectStakingModuleData({
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
          // TODO: lastChangedBlockHash the same for every module, add in blockData
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
  private async checkKeys(
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
        stakingModuleData.duplicatedKeys = this.filterModuleNotVettedUnusedKeys(
          stakingModuleData.stakingModuleAddress,
          stakingModuleData.vettedUnusedKeys,
          duplicates,
        );
        stakingModuleData.unresolvedDuplicatedKeys =
          this.filterModuleNotVettedUnusedKeys(
            stakingModuleData.stakingModuleAddress,
            stakingModuleData.vettedUnusedKeys,
            unresolved,
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

  /**
   * filter from the list all keys that are not vetted as unused
   */
  public filterModuleNotVettedUnusedKeys(
    stakingModuleAddress: string,
    vettedUnusedKeys: RegistryKey[],
    keys: RegistryKey[],
  ) {
    const vettedUnused = keys
      .filter((key) => key.moduleAddress === stakingModuleAddress)
      .filter((key) => {
        const r = vettedUnusedKeys.some(
          (k) => k.index == key.index && k.operatorIndex == key.operatorIndex,
        );

        return r;
      });

    return vettedUnused;
  }
}
