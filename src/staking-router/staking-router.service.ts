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

@Injectable()
export class StakingRouterService {
  // protected stakingRouterCache: Record<number, StakingModuleData> = {};

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly keysApiService: KeysApiService,
  ) {}

  /**
   * Return staking module data and block information
   */
  public async getStakingModulesData(): Promise<{
    stakingModulesData: StakingModuleData[];
    blockHash: string;
    blockNumber: number;
  }> {
    const { data: operatorsByModules, meta: operatorsMeta } =
      await this.keysApiService.getOperatorListWithModule();

    const { data: unusedKeys, meta: unusedKeysMeta } =
      await this.keysApiService.getUnusedKeys();

    const blockHash = operatorsMeta.elBlockSnapshot.blockHash;
    const blockNumber = operatorsMeta.elBlockSnapshot.blockNumber;

    this.isEqualLastChangedBlockHash(
      operatorsMeta.elBlockSnapshot.lastChangedBlockHash,
      unusedKeysMeta.elBlockSnapshot.lastChangedBlockHash,
    );

    const stakingModulesData = operatorsByModules.map(
      ({ operators, module: stakingModule }) =>
        this.processModuleData({
          operators,
          stakingModule,
          unusedKeys,
          meta: operatorsMeta,
        }),
    );

    return { stakingModulesData, blockHash, blockNumber };
  }

  private isEqualLastChangedBlockHash(
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
