import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { BlockData, StakingModuleData } from 'guardian';
import { getVettedKeys, getVettedUnusedKeys } from './vetted-keys';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { Meta } from 'keys-api/interfaces/Meta';
import { SROperatorListWithModule } from 'keys-api/interfaces/SROperatorListWithModule';
import { SecurityService } from 'contracts/security';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';
import { getDuplicatedKeys } from 'guardian/duplicates/keys-duplication-checker';

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private readonly config: Configuration,
    private securityService: SecurityService,
    private stakingModuleGuardService: StakingModuleGuardService,
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
        const keys = lidoKeys.filter(
          (key) => key.moduleAddress === stakingModule.stakingModuleAddress,
        );
        const moduleVettedKeys = getVettedKeys(operators, keys);
        const moduleVettedUnusedKeys = getVettedUnusedKeys(moduleVettedKeys);

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
          vettedKeys: moduleVettedKeys,
          duplicatedKeys: [],
          invalidKeys: [],
          frontRunKeys: [],
        };
      }),
    );

    const vettedKeys =
      this.stakingModuleGuardService.getVettedKeys(stakingModulesData);

    const duplicatedKeys = getDuplicatedKeys(vettedKeys);

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

        const moduleDuplicatedKeys = duplicatedKeys.filter(
          (key) => key.moduleAddress === stakingModuleData.stakingModuleAddress,
        );

        this.logger.log('Duplicated keys', {
          count: moduleDuplicatedKeys.length,
          stakingModuleId: stakingModuleData.stakingModuleId,
          blockNumber: meta.elBlockSnapshot.blockNumber,
        });

        stakingModuleData.duplicatedKeys = moduleDuplicatedKeys;
      }),
    );

    return stakingModulesData;
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
