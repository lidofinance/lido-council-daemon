import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SRModuleKeysResponse, SRModule } from 'keys-api/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { StakingModuleData } from 'guardian';
import { SecurityService } from 'contracts/security';

@Injectable()
export class StakingRouterService {
  protected stakingRouterCache: Record<number, SRModuleKeysResponse> = {};
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly keysApiService: KeysApiService,
  ) {}

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
        'Blockhash of the received keys does not match the current blockhash',
      );
    }

    this.setStakingRouterCache(id, srResponse);

    return srResponse;
  }

  public async getVettedAndUnusedKeys() {
    // TODO: add cache by modules nonce
    const operatorsByModules =
      await this.keysApiService.getOperatorListWithModule();
    const operatorsBlockHash =
      operatorsByModules.meta.elBlockSnapshot.blockHash;
    const operatorsBlockNumber =
      operatorsByModules.meta.elBlockSnapshot.blockNumber;

    const unusedKeys = await this.keysApiService.getUnusedKeys();
    const keysBlockHash = unusedKeys.meta.elBlockSnapshot.blockHash;
    if (keysBlockHash != operatorsBlockHash) {
      this.logger.log('Blockhash of the received keys and operators', {
        keysBlockHash,
        operatorsBlockHash,
      });

      throw Error(
        'Blockhash of the received keys does not match the blockhash of operators',
      );
    }

    // found vetted keys
    const vettedKeys: RegistryKey[] = [];
    const stakingModulesData: StakingModuleData[] = [];

    operatorsByModules.data.forEach(({ operators, module: stakingModule }) => {
      const moduleKeys: RegistryKey[] = [];
      const moduleVettedKeys: RegistryKey[] = [];
      operators.forEach((operator) => {
        const operatorKeys = unusedKeys.data.filter(
          (key) =>
            key.moduleAddress === operator.moduleAddress &&
            key.operatorIndex === operator.index,
        );
        // Sort the filtered keys by index
        operatorKeys.sort((a, b) => a.index - b.index);

        moduleKeys.push(...operatorKeys);

        const numberOfVettedUnusedKeys =
          operator.stakingLimit - operator.usedSigningKeys;
        const operatorVettedKeys = operatorKeys.slice(
          0,
          numberOfVettedUnusedKeys,
        );
        moduleVettedKeys.push(...operatorVettedKeys);
        vettedKeys.push(...operatorVettedKeys);
      });

      stakingModulesData.push({
        unusedKeys: moduleKeys.map((srKey) => srKey.key),
        nonce: stakingModule.nonce,
        stakingModuleId: stakingModule.id,
        blockHash: operatorsBlockHash,
        vettedKeys: moduleVettedKeys,
      });
    });

    return {
      stakingModulesData,
      vettedKeys,
      blockHash: operatorsBlockHash,
      blockNumber: operatorsBlockNumber,
    };
  }

  public async getKeysWithDuplicates(pubkeys: string[]) {
    return await this.keysApiService.getKeysWithDuplicates(pubkeys);
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
