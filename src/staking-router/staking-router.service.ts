import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { StakingModuleData } from 'guardian';
import { getVettedUnusedKeys } from './vetted-keys';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { SRModule } from 'keys-api/interfaces';
import { Meta } from 'keys-api/interfaces/Meta';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { GroupedByModuleOperatorListResponse } from 'keys-api/interfaces/GroupedByModuleOperatorListResponse';

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly keysApiService: KeysApiService,
  ) {}

  protected stakingRouterCache: Record<number, StakingModuleData> = {};

  async getOperatorsAndModules() {
    const { data: operatorsByModules, meta: operatorsMeta } =
      await this.keysApiService.getOperatorListWithModule();

    return { data: operatorsByModules, meta: operatorsMeta };
  }

  async fetchUnusedKeys(moduleAddresses: string[]) {
    const { data: unusedKeys, meta: unusedKeysMeta } =
      await this.keysApiService.getUnusedKeys(moduleAddresses);

    return { data: unusedKeys, meta: unusedKeysMeta };
  }

  /**
   * Return staking module data and block information
   */
  async getStakingModulesData(
    data: GroupedByModuleOperatorListResponse,
  ): Promise<StakingModuleData[]> {
    const { data: operatorsByModules, meta: operatorsMeta } = data;

    const cachedData: StakingModuleData[] = [];
    const outdatedModuleAddresses: string[] = [];

    // if module was deleted we will not include data in final result
    // TODO: add test on delete
    operatorsByModules.forEach(({ module: stakingModuleData }) => {
      if (this.isDataOutdated(stakingModuleData)) {
        outdatedModuleAddresses.push(stakingModuleData.stakingModuleAddress);
        return;
      }
      cachedData.push(this.stakingRouterCache[stakingModuleData.id]);
      return;
    });

    if (!outdatedModuleAddresses.length) return cachedData;

    const { data: unusedKeys, meta: unusedKeysMeta } =
      await this.fetchUnusedKeys(outdatedModuleAddresses);

    this.isEqualLastChangedBlockHash(
      operatorsMeta.elBlockSnapshot.lastChangedBlockHash,
      unusedKeysMeta.elBlockSnapshot.lastChangedBlockHash,
    );

    const actualizedData = operatorsByModules
      .filter(({ module: stakingModuleData }) =>
        outdatedModuleAddresses.includes(
          stakingModuleData.stakingModuleAddress,
        ),
      )
      .map(({ operators, module: stakingModule }) =>
        this.processModuleData({
          operators,
          stakingModule,
          unusedKeys,
          meta: operatorsMeta,
        }),
      );

    // update cache
    actualizedData.forEach((stakingModule: StakingModuleData) => {
      this.stakingRouterCache[stakingModule.stakingModuleId] = stakingModule;
    });

    return [...actualizedData, ...cachedData];
  }

  private isDataOutdated(stakingModule: SRModule): boolean {
    const cachedEntity = this.stakingRouterCache[stakingModule.id];
    // wasn't cached ot lastChangedBlockHash was changed, so operators or keys were possibly changed
    if (
      !cachedEntity ||
      cachedEntity.lastChangedBlockHash != stakingModule.lastChangedBlockHash
    ) {
      return true;
    }
    // lastChangedBlockHash was changed, so operators or keys were possibly changed
    return false;
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
    meta,
  }: {
    operators: RegistryOperator[];
    stakingModule: SRModule;
    unusedKeys: RegistryKey[];
    meta: Meta;
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
      blockHash: meta.elBlockSnapshot.blockHash,
      lastChangedBlockHash: meta.elBlockSnapshot.lastChangedBlockHash,
      vettedUnusedKeys: moduleVettedUnusedKeys,
    };
  }

  public async findKeysEntires(pubkeys: string[]) {
    return await this.keysApiService.findKeysEntires(pubkeys);
  }
}
