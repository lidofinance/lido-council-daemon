import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { StakingModuleData } from 'guardian';
import { getVettedKeys, getVettedUnusedKeys } from './vetted-keys';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { Meta } from 'keys-api/interfaces/Meta';
import { SROperatorListWithModule } from 'keys-api/interfaces/SROperatorListWithModule';
import { SecurityService } from 'contracts/security';

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly keysApiService: KeysApiService,
    private securityService: SecurityService,
  ) {}

  /**
   * Return staking module data and block information
   */
  public async getStakingModulesData({
    operatorsByModules,
    meta,
    lidoKeys,
  }: {
    operatorsByModules: SROperatorListWithModule[];
    meta: Meta;
    lidoKeys: RegistryKey[];
  }): Promise<StakingModuleData[]> {
    const stakingModulesData = await Promise.all(
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

  public async getKeysByPubkeys(pubkeys: string[]) {
    return await this.keysApiService.getKeysByPubkeys(pubkeys);
  }
}
