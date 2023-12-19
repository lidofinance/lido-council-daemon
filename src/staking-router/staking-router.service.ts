import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SRModuleKeysResponse, SRModule } from 'keys-api/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { StakingModuleData } from 'guardian';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';

@Injectable()
export class StakingRouterService {
  protected stakingRouterCache: Record<number, SRModuleKeysResponse> = {};
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
    // TODO: add cache by modules nonce
    const { operatorsByModules, unusedKeys, blockHash, blockNumber } =
      await this.getOperatorsAndUnusedKeysFromKAPI();
    // all staking modules list
    const stakingModulesData: StakingModuleData[] = operatorsByModules.data.map(
      ({ operators, module: stakingModule }) => {
        const { moduleUnusedKeys, moduleVettedKeys } =
          this.getModuleOperatorsVettedKeys(operators, unusedKeys.data);

        return {
          unusedKeys: moduleUnusedKeys.map((srKey) => srKey.key),
          nonce: stakingModule.nonce,
          stakingModuleId: stakingModule.id,
          blockHash,
          vettedKeys: moduleVettedKeys,
        };
      },
    );

    return {
      stakingModulesData,
      blockHash,
      blockNumber,
    };
  }

  /**
   * Request grouped by modules operators and all staking modules keys with meta from KAPI
   */
  private async getOperatorsAndUnusedKeysFromKAPI() {
    const operatorsByModules =
      await this.keysApiService.getOperatorListWithModule();
    const { blockHash: operatorsBlockHash, blockNumber: operatorsBlockNumber } =
      operatorsByModules.meta.elBlockSnapshot;

    const unusedKeys = await this.keysApiService.getUnusedKeys();
    const { blockHash: keysBlockHash } = unusedKeys.meta.elBlockSnapshot;

    this.validateBlockHashMatch(keysBlockHash, operatorsBlockHash);

    return {
      operatorsByModules,
      unusedKeys,
      blockHash: operatorsBlockHash,
      blockNumber: operatorsBlockNumber,
    };
  }

  private validateBlockHashMatch(
    keysBlockHash: string,
    operatorsBlockHash: string,
  ) {
    if (keysBlockHash !== operatorsBlockHash) {
      this.logger.error(
        'Blockhash of the received keys and operators dont match',
        {
          keysBlockHash,
          operatorsBlockHash,
        },
      );

      throw new Error(
        'Blockhash of the received keys does not match the blockhash of operators',
      );
    }
  }

  private getModuleOperatorsVettedKeys(
    moduleOperators: RegistryOperator[],
    allModulesUnusedKeys: RegistryKey[],
  ) {
    const moduleUnusedKeys: RegistryKey[] = [];
    // all module vetted keys
    const moduleVettedKeys: RegistryKey[] = [];

    moduleOperators.forEach((operator) => {
      const operatorKeys = this.getSortedOperatorKeys(
        allModulesUnusedKeys,
        operator,
      );

      moduleUnusedKeys.push(...operatorKeys);

      const operatorVettedKeys = this.getOperatorVettedKeys(
        operatorKeys,
        operator,
      );
      moduleVettedKeys.push(...operatorVettedKeys);
    });

    return {
      moduleUnusedKeys,
      moduleVettedKeys,
    };
  }

  /***
   * @param unusedKeys - keys list of all staking modules
   * @param operator - staking module operator
   * @returns sorted operator's keys list
   */
  private getSortedOperatorKeys(
    keys: RegistryKey[],
    operator: RegistryOperator,
  ): RegistryKey[] {
    const operatorSortedKeys = keys
      .filter(
        (key) =>
          key.moduleAddress === operator.moduleAddress &&
          key.operatorIndex === operator.index,
      )
      .sort((a, b) => a.index - b.index);
    return operatorSortedKeys;
  }

  /***
   * Got sorted unused keys and return vetted keys
   */
  private getOperatorVettedKeys(
    unusedKeys: RegistryKey[],
    operator: RegistryOperator,
  ): RegistryKey[] {
    const numberOfVettedUnusedKeys =
      operator.stakingLimit - operator.usedSigningKeys;
    return unusedKeys.slice(0, numberOfVettedUnusedKeys);
  }

  public async findKeysEntires(pubkeys: string[]) {
    return await this.keysApiService.findKeysEntires(pubkeys);
  }

  public async getStakingModules() {
    return await this.keysApiService.getModulesList();
  }

  public async getStakingModuleUnusedKeys(
    blockHash: string,
    { id, nonce }: SRModule,
  ) {
    if (!this.isNeedToUpdateState(id, nonce))
      return this.getStakingRouterKeysCache(id);

    const srResponse = await this.keysApiService.getUnusedModuleKeys(id);
    const srModuleBlockHash = srResponse.meta.elBlockSnapshot.blockHash;

    if (srModuleBlockHash !== blockHash) {
      this.logger.log('Blockhash of the received keys', {
        srModuleBlockHash,
        blockHash,
      });

      throw Error(
        'Block hash of the received keys does not match the current block hash',
      );
    }

    this.setStakingRouterCache(id, srResponse);

    return srResponse;
  }

  protected getStakingRouterKeysCache(stakingModuleId: number) {
    return this.stakingRouterCache[stakingModuleId];
  }

  protected setStakingRouterCache(
    stakingModuleId: number,
    srResponse: SRModuleKeysResponse,
  ) {
    this.stakingRouterCache[stakingModuleId] = srResponse;
  }

  protected isNeedToUpdateState(stakingModuleId: number, nextNonce: number) {
    const cache = this.getStakingRouterKeysCache(stakingModuleId);
    if (!cache) return true;

    const prevNonce = cache.data.module.nonce;
    return prevNonce !== nextNonce;
  }
}
