import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { StakingModuleData, BlockData } from 'guardian';
import { getVettedUnusedKeys } from './vetted-keys';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { Meta } from 'keys-api/interfaces/Meta';
import { SROperatorListWithModule } from 'keys-api/interfaces/SROperatorListWithModule';
import { SecurityService } from 'contracts/security';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';
import { KeysDuplicationCheckerService } from 'guardian/duplicates';

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
  }: {
    operatorsByModules: SROperatorListWithModule[];
    meta: Meta;
    lidoKeys: RegistryKey[];
    blockData: BlockData;
  }): Promise<StakingModuleData[]> {
    const stakingModulesData: StakingModuleData[] = await Promise.all(
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
            blockHash: meta.elBlockSnapshot.blockHash,
          });

        return {
          isModuleDepositsPaused,
          nonce: stakingModule.nonce,
          stakingModuleId: stakingModule.id,
          stakingModuleAddress: stakingModule.stakingModuleAddress,
          blockHash: meta.elBlockSnapshot.blockHash,
          lastChangedBlockHash: meta.elBlockSnapshot.lastChangedBlockHash,
          vettedUnusedKeys: moduleVettedUnusedKeys,
          duplicatedKeys: [],
          invalidKeys: [],
          frontRunKeys: [],
        };
      }),
    );

    const duplicatedKeys =
      await this.keysDuplicationCheckerService.getDuplicatedKeys(
        lidoKeys,
        blockData,
      );

    await Promise.all(
      stakingModulesData.map(async (stakingModuleData) => {
        const frontRunKeys = this.stakingModuleGuardService.getFrontRunAttempts(
          stakingModuleData,
          blockData,
        );

        stakingModuleData.frontRunKeys = frontRunKeys;

        this.logger.log('Front-run keys', {
          count: frontRunKeys.length,
          stakingModuleId: stakingModuleData.stakingModuleId,
          blockNumber: meta.elBlockSnapshot.blockNumber,
        });

        const invalidKeys = await this.stakingModuleGuardService.getInvalidKeys(
          stakingModuleData,
          blockData,
        );

        this.logger.log('Invalid signature keys', {
          count: invalidKeys.length,
          stakingModuleId: stakingModuleData.stakingModuleId,
          blockNumber: meta.elBlockSnapshot.blockNumber,
        });

        stakingModuleData.invalidKeys = invalidKeys;

        const moduleDuplicatedVettedUnusedKeys =
          this.filterModuleNotVettedUnusedKeys(
            stakingModuleData.stakingModuleAddress,
            stakingModuleData.vettedUnusedKeys,
            duplicatedKeys,
          );

        this.logger.log('Duplicated keys', {
          count: moduleDuplicatedVettedUnusedKeys.length,
          stakingModuleId: stakingModuleData.stakingModuleId,
          blockNumber: meta.elBlockSnapshot.blockNumber,
        });

        stakingModuleData.duplicatedKeys = moduleDuplicatedVettedUnusedKeys;
      }),
    );

    return stakingModulesData;
  }

  /**
   * filter from the list all keys that are not vetted as unused
   */
  private filterModuleNotVettedUnusedKeys(
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

  public isEqualLastChangedBlockHash(
    firstRequestHash: string,
    secondRequestHash: string,
  ) {
    if (firstRequestHash !== secondRequestHash) {
      const error =
        'Since the last request, data in Kapi has been updated. This may result in inconsistencies between the data from two separate requests.';

      this.logger.error(error, { firstRequestHash, secondRequestHash });

      throw new InconsistentLastChangedBlockHash();
    }
  }
}
