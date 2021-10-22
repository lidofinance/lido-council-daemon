import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { arrayify, hexlify } from '@ethersproject/bytes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { RegistryAbi, RegistryAbi__factory } from 'generated';
import { ProviderService } from 'provider';
import { SecurityService } from 'contracts/security';
import {
  getRegistryAddress,
  REGISTRY_KEYS_CACHE_UPDATE_BLOCK_RATE,
  REGISTRY_KEYS_QUERY_BATCH_SIZE,
} from './registry.constants';
import {
  NodeOperator,
  NodeOperatorsCache,
  NodeOperatorsKey,
  NodeOperatorWithKeys,
} from './interfaces';
import { range } from 'utils';
import { CacheService } from 'cache';
import { OneAtTime } from 'common/decorators';
import { BlockData } from 'guardian';

@Injectable()
export class RegistryService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private securityService: SecurityService,
    private cacheService: CacheService<NodeOperatorsCache>,
  ) {}

  @OneAtTime()
  public async handleNewBlock({ blockNumber }: BlockData): Promise<void> {
    if (blockNumber % REGISTRY_KEYS_CACHE_UPDATE_BLOCK_RATE !== 0) return;
    await this.updateNodeOperatorsCache();
  }

  private cachedContract: RegistryAbi | null = null;
  private cachedBatchContracts: Map<string, Promise<RegistryAbi>> = new Map();
  private cachedPubKeyLength: number | null = null;

  public async getContract(): Promise<RegistryAbi> {
    if (!this.cachedContract) {
      const address = await this.getRegistryAddress();
      const provider = this.providerService.provider;
      this.cachedContract = RegistryAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  public async getCachedBatchContract(
    cacheKey: string | number,
  ): Promise<RegistryAbi> {
    const cacheKeyStr = String(cacheKey);
    let cachedBatchContract = this.cachedBatchContracts.get(cacheKeyStr);

    if (!cachedBatchContract) {
      cachedBatchContract = new Promise(async (resolve) => {
        const contract = await this.getContract();
        const provider = this.providerService.getNewBatchProviderInstance();
        resolve(contract.connect(provider));
      });

      this.cachedBatchContracts.set(cacheKeyStr, cachedBatchContract);
    }

    return await cachedBatchContract;
  }

  public async getPubkeyLength(): Promise<number> {
    if (!this.cachedPubKeyLength) {
      const contract = await this.getContract();
      const keyLength = await contract.PUBKEY_LENGTH();
      this.cachedPubKeyLength = keyLength.toNumber();
    }

    return this.cachedPubKeyLength;
  }

  public async splitPubKeys(hexString: string): Promise<string[]> {
    const pubkeyLength = await this.getPubkeyLength();
    const byteArray = arrayify(hexString);
    const splittedKeys = this.splitPubKeysArray(byteArray, pubkeyLength).map(
      (array) => hexlify(array),
    );

    return splittedKeys;
  }

  public splitPubKeysArray(array: Uint8Array, keyLength: number): Uint8Array[] {
    const keysNumber = array.length / keyLength;

    if (keyLength <= 0) throw new Error('Invalid key length size');
    if (keysNumber % 1 > 0) throw new Error('Invalid array length');

    const result: Uint8Array[] = [];
    for (let i = 0; i < array.length; i += keyLength) {
      result.push(array.slice(i, i + keyLength));
    }

    return result;
  }

  public async getRegistryAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getRegistryAddress(chainId);
  }

  public async getNextSigningKeys() {
    const [contract, maxDepositKeys, lidoAddress] = await Promise.all([
      this.getContract(),
      this.securityService.getMaxDeposits(),
      this.securityService.getLidoContractAddress(),
    ]);

    const overrides = { from: lidoAddress };
    const [pubKeys] = await contract.callStatic.assignNextSigningKeys(
      maxDepositKeys,
      overrides,
    );

    const splittedKeys = this.splitPubKeys(pubKeys);
    return splittedKeys;
  }

  public async getKeysOpIndex(): Promise<number> {
    const contract = await this.getContract();
    const keysOpIndex = await contract.getKeysOpIndex();

    return keysOpIndex.toNumber();
  }

  public async getNodeOperatorsCount(): Promise<number> {
    const contract = await this.getContract();
    const operatorsTotal = await contract.getNodeOperatorsCount();

    return operatorsTotal.toNumber();
  }

  public async getNodeOperator(operatorId: number): Promise<NodeOperator> {
    const contract = await this.getCachedBatchContract('operator');

    const {
      active,
      name,
      rewardAddress,
      stakingLimit,
      stoppedValidators,
      totalSigningKeys,
      usedSigningKeys,
    } = await contract.getNodeOperator(operatorId, true);

    return {
      id: operatorId,
      active,
      name,
      rewardAddress,
      stakingLimit: stakingLimit.toNumber(),
      stoppedValidators: stoppedValidators.toNumber(),
      totalSigningKeys: totalSigningKeys.toNumber(),
      usedSigningKeys: usedSigningKeys.toNumber(),
    };
  }

  public async getNodeOperatorsData(): Promise<NodeOperator[]> {
    const operatorsTotal = await this.getNodeOperatorsCount();

    return await Promise.all(
      range(0, operatorsTotal).map(async (operatorId) => {
        const operatorData = await this.getNodeOperator(operatorId);

        return { ...operatorData, id: operatorId };
      }),
    );
  }

  public async getNodeOperatorKeys(
    operatorId: number,
    from: number,
    to: number,
  ): Promise<NodeOperatorsKey[]> {
    return await Promise.all(
      range(from, to).map(async (keyId) => {
        const seedKey = Math.floor(keyId / REGISTRY_KEYS_QUERY_BATCH_SIZE);
        const contract = await this.getCachedBatchContract(seedKey);

        const result = await contract.getSigningKey(operatorId, keyId);
        const { key, depositSignature, used } = result;

        return { operatorId, key, depositSignature, used, id: keyId };
      }),
    );
  }

  public async updateNodeOperatorsCache() {
    const [cache, currentKeysOpIndex] = await Promise.all([
      this.getCachedNodeOperators(),
      this.getKeysOpIndex(),
    ]);

    const isSameKeys = cache.keysOpIndex === currentKeysOpIndex;
    if (isSameKeys) return;

    const currentOperators = await this.getNodeOperatorsData();
    const mergedOperators: NodeOperatorWithKeys[] = [];

    this.logger.log('Operators are fetched', {
      operators: currentOperators.length,
    });

    for (const operator of currentOperators) {
      const { id: operatorId, rewardAddress } = operator;
      const cachedOperator = cache.operators[operatorId];
      const isSameCachedOperator =
        cachedOperator?.rewardAddress === rewardAddress;

      let keys: NodeOperatorsKey[] = [];

      if (isSameCachedOperator) {
        const from = operator.usedSigningKeys;
        const to = operator.totalSigningKeys;

        // We get used keys from the cache, since the contract does not allow to change them
        const cachedUsedKeys = cachedOperator.keys.slice(0, from);
        const newKeys = await this.getNodeOperatorKeys(operatorId, from, to);
        keys = cachedUsedKeys.concat(newKeys);
      } else {
        const from = 0;
        const to = operator.totalSigningKeys;
        keys = await this.getNodeOperatorKeys(operatorId, from, to);
      }

      this.logger.log('Operator keys are fetched', {
        operatorName: operator.name,
        keys: keys.length,
      });

      mergedOperators[operatorId] = { ...operator, keys };
    }

    await this.setCachedNodeOperatorsKeys({
      operators: mergedOperators,
      keysOpIndex: currentKeysOpIndex,
    });
  }

  public async getCachedNodeOperators(): Promise<NodeOperatorsCache> {
    return await this.cacheService.getCache();
  }

  public async setCachedNodeOperatorsKeys(
    cache: NodeOperatorsCache,
  ): Promise<void> {
    return await this.cacheService.setCache(cache);
  }
}
