import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SRModuleKeysResponse, SRModule } from 'keys-api/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { StakingModuleData } from 'guardian';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';
import { InconsistentBlockhashError } from './errors';

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
    // get list of all unused keys and operators
    const { operatorsByModules, unusedKeys, blockHash, blockNumber } =
      await this.getOperatorsAndUnusedKeys();

    // iterate by modules and filter
    const stakingModulesData: StakingModuleData[] = operatorsByModules.data.map(
      ({ operators, module: stakingModule }) => {
        const { moduleUnusedKeys, moduleVettedKeys } =
          this.getModuleUnusedAndVettedUnusedKeys(operators, unusedKeys.data);

        return {
          unusedKeys: moduleUnusedKeys.map((srKey) => srKey.key),
          nonce: stakingModule.nonce,
          stakingModuleId: stakingModule.id,
          blockHash,
          vettedUnusedKeys: moduleVettedKeys,
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
  private async getOperatorsAndUnusedKeys() {
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

      throw new InconsistentBlockhashError();
    }
  }

  private getModuleUnusedAndVettedUnusedKeys(
    moduleOperators: RegistryOperator[],
    allModulesUnusedKeys: RegistryKey[],
  ) {
    const moduleUnusedKeys: RegistryKey[] = [];
    // all module vetted keys
    const moduleVettedKeys: RegistryKey[] = [];

    moduleOperators.forEach((operator) => {
      // all operator unused keys
      const operatorKeys = this.filterAndSortOperatorKeys(
        allModulesUnusedKeys,
        operator,
      );

      moduleUnusedKeys.push(...operatorKeys);

      const operatorVettedUnusedKeys = this.getOperatorVettedUnusedKeys(
        operatorKeys,
        operator,
      );
      moduleVettedKeys.push(...operatorVettedUnusedKeys);
    });

    return {
      moduleUnusedKeys,
      moduleVettedKeys,
    };
  }

  /***
   * @param keys - keys list of all staking modules
   * @param operator - staking module operator
   * @returns sorted operator's keys list
   */
  private filterAndSortOperatorKeys(
    keys: RegistryKey[],
    operator: RegistryOperator,
  ): RegistryKey[] {
    const operatorKeys = keys
      .filter(
        (key) =>
          key.moduleAddress === operator.moduleAddress &&
          key.operatorIndex === operator.index,
      )
      .sort((a, b) => a.index - b.index);
    return operatorKeys;
  }

  /***
   * Got sorted by index unused keys and return vetted unused keys
   */
  private getOperatorVettedUnusedKeys(
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
}
