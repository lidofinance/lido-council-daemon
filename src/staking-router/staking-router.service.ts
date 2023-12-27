import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { StakingModuleData } from 'guardian';
import { getVettedUnusedKeys } from './vetted-keys';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { SRModule } from 'keys-api/interfaces';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { GroupedByModuleOperatorListResponse } from 'keys-api/interfaces/GroupedByModuleOperatorListResponse';

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly keysApiService: KeysApiService,
  ) {}

  async getOperatorsAndModules() {
    const { data: operatorsByModules, meta: operatorsMeta } =
      await this.keysApiService.getOperatorListWithModule();

    return { data: operatorsByModules, meta: operatorsMeta };
  }

  /**
   * Return staking module data and block information
   */
  public async getStakingModulesData(
    data: GroupedByModuleOperatorListResponse,
  ): Promise<StakingModuleData[]> {
    const { data: operatorsByModules, meta: operatorsMeta } = data;

    const { data: unusedKeys, meta: unusedKeysMeta } =
      await this.keysApiService.getUnusedKeys();

    const blockHash = operatorsMeta.elBlockSnapshot.blockHash;
    const lastChangedBlockHash =
      operatorsMeta.elBlockSnapshot.lastChangedBlockHash;

    this.isEqualLastChangedBlockHash(
      lastChangedBlockHash,
      unusedKeysMeta.elBlockSnapshot.lastChangedBlockHash,
    );

    const stakingModulesData = operatorsByModules.map(
      ({ operators, module: stakingModule }) =>
        this.processModuleData({
          operators,
          stakingModule,
          unusedKeys,
          blockHash,
          // Will set the lastChangedBlockHash for the module in KAPI, not the personal module's lastChangedBlockHash
          lastChangedBlockHash,
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

  private processModuleData({
    operators,
    stakingModule,
    unusedKeys,
    blockHash,
    lastChangedBlockHash,
  }: {
    operators: RegistryOperator[];
    stakingModule: SRModule;
    unusedKeys: RegistryKey[];
    blockHash: string;
    lastChangedBlockHash: string;
  }): StakingModuleData {
    const moduleUnusedKeys = unusedKeys.filter(
      (key) => key.moduleAddress === stakingModule.stakingModuleAddress,
    );

    const moduleVettedUnusedKeys = getVettedUnusedKeys(
      operators,
      moduleUnusedKeys,
    );

    return {
      unusedKeys: moduleUnusedKeys.map((srKey) => srKey.key),
      nonce: stakingModule.nonce,
      stakingModuleId: stakingModule.id,
      blockHash,
      lastChangedBlockHash,
      vettedUnusedKeys: moduleVettedUnusedKeys,
    };
  }

  public async findKeysEntires(pubkeys: string[]) {
    return await this.keysApiService.findKeysEntires(pubkeys);
  }
}
