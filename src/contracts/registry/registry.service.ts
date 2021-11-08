import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { RegistryAbi, RegistryAbi__factory } from 'generated';
import { ProviderService, BlockTag } from 'provider';
import { SecurityService } from 'contracts/security';
import { DepositService } from 'contracts/deposit';
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
import { range, splitPubKeys } from 'utils';
import { CacheService } from 'cache';
import { OneAtTime } from 'common/decorators';
import { BlockData } from 'guardian';
import { APP_VERSION } from 'app.constants';

@Injectable()
export class RegistryService implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private securityService: SecurityService,
    private depositService: DepositService,
    private cacheService: CacheService<NodeOperatorsCache>,
  ) {}

  @OneAtTime()
  public async handleNewBlock({ blockNumber }: BlockData): Promise<void> {
    if (blockNumber % REGISTRY_KEYS_CACHE_UPDATE_BLOCK_RATE !== 0) return;
    await this.updateNodeOperatorsCache(blockNumber);
  }

  private cachedContract: RegistryAbi | null = null;
  private cachedBatchContracts: Map<string, Promise<RegistryAbi>> = new Map();
  private cachedPubKeyLength: number | null = null;

  async onModuleInit() {
    const cache = await this.getCachedNodeOperators();
    const versions = {
      cachedVersion: cache.version,
      currentVersion: APP_VERSION,
    };

    if (cache.version === APP_VERSION) {
      this.logger.log(
        'Node Operators cache version matches the application version',
        versions,
      );

      return;
    }

    this.logger.log(
      'Node Operators cache does not match the application version, clearing the cache',
      versions,
    );

    try {
      await this.deleteCachedNodeOperatorsKeys();
      this.logger.log('Node Operators cache cleared');
    } catch (error) {
      this.logger.error(error);
      process.exit(1);
    }
  }

  /**
   * Returns an instance of the contract
   */
  public async getContract(): Promise<RegistryAbi> {
    if (!this.cachedContract) {
      const address = await this.getRegistryAddress();
      const provider = this.providerService.provider;
      this.cachedContract = RegistryAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  /**
   * Returns an instance of the contract with connected batch RPC provider
   * @param cacheKey - contract storage key in the cache
   * @returns instance of the contract
   */
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

  /**
   * Returns the length of the public keys stored in the contract
   */
  public async getPubkeyLength(): Promise<number> {
    if (!this.cachedPubKeyLength) {
      const contract = await this.getContract();
      const keyLength = await contract.PUBKEY_LENGTH();
      this.cachedPubKeyLength = keyLength.toNumber();
    }

    return this.cachedPubKeyLength;
  }

  /**
   * Returns an address of the registry contract
   */
  public async getRegistryAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getRegistryAddress(chainId);
  }

  /**
   * Returns all keys that can be used for the deposit in the next transaction
   * @returns array of public keys
   */
  public async getNextSigningKeys(blockTag?: BlockTag) {
    const [contract, maxDepositKeys, lidoAddress, pubkeyLength] =
      await Promise.all([
        this.getContract(),
        this.securityService.getMaxDeposits(blockTag),
        this.securityService.getLidoContractAddress(),
        this.getPubkeyLength(),
      ]);

    const overrides = { blockTag: blockTag as any, from: lidoAddress };
    const [pubKeys] = await contract.callStatic.assignNextSigningKeys(
      maxDepositKeys,
      overrides,
    );

    const splittedKeys = splitPubKeys(pubKeys, pubkeyLength);
    return splittedKeys;
  }

  /**
   * Returns a monotonically increasing counter,
   * which increases when any of the key operations are performed
   */
  public async getKeysOpIndex(blockTag?: BlockTag): Promise<number> {
    const contract = await this.getContract();
    const keysOpIndex = await contract.getKeysOpIndex({
      blockTag: blockTag as any,
    });

    return keysOpIndex.toNumber();
  }

  /**
   * Returns a number of node operators stored in the contract
   */
  public async getNodeOperatorsCount(blockTag?: BlockTag): Promise<number> {
    const contract = await this.getContract();
    const operatorsTotal = await contract.getNodeOperatorsCount({
      blockTag: blockTag as any,
    });

    return operatorsTotal.toNumber();
  }

  /**
   * Returns information about the operator
   * @param operatorId - node operator id
   * @returns operator info
   */
  public async getNodeOperator(
    operatorId: number,
    blockTag?: BlockTag,
  ): Promise<NodeOperator> {
    const contract = await this.getCachedBatchContract('operator');

    const {
      active,
      name,
      rewardAddress,
      stakingLimit,
      stoppedValidators,
      totalSigningKeys,
      usedSigningKeys,
    } = await contract.getNodeOperator(operatorId, true, {
      blockTag: blockTag as any,
    });

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

  /**
   * Returns information about all node operators
   * @returns array of node operators
   */
  public async getNodeOperatorsData(
    blockTag?: BlockTag,
  ): Promise<NodeOperator[]> {
    const operatorsTotal = await this.getNodeOperatorsCount(blockTag);

    return await Promise.all(
      range(0, operatorsTotal).map(async (operatorId) => {
        const operatorData = await this.getNodeOperator(operatorId, blockTag);

        return { ...operatorData, id: operatorId };
      }),
    );
  }

  /**
   * Returns a list of node operators keys in the range
   * @param operatorId - node operator id
   * @param from - start key index
   * @param to - end key index
   * @returns array of node operator keys
   */
  public async getNodeOperatorKeys(
    operatorId: number,
    from: number,
    to: number,
    blockTag?: BlockTag,
  ): Promise<NodeOperatorsKey[]> {
    return await Promise.all(
      range(from, to).map(async (keyId) => {
        const seedKey = Math.floor(keyId / REGISTRY_KEYS_QUERY_BATCH_SIZE);
        const contract = await this.getCachedBatchContract(seedKey);

        const overrides = { blockTag: blockTag as any };
        const result = await contract.getSigningKey(
          operatorId,
          keyId,
          overrides,
        );
        const { key, depositSignature, used } = result;

        return { operatorId, key, depositSignature, used, id: keyId };
      }),
    );
  }

  /**
   * Updates the cache of node operators if keysOpIndex is changed
   */
  public async updateNodeOperatorsCache(blockTag?: BlockTag): Promise<void> {
    const [cache, currentKeysOpIndex, currentDepositRoot] = await Promise.all([
      this.getCachedNodeOperators(),
      this.getKeysOpIndex(blockTag),
      this.depositService.getDepositRoot(blockTag),
    ]);

    const isSameKeysOpIndex = cache.keysOpIndex === currentKeysOpIndex;
    const isSameDepositRoot = cache.depositRoot === currentDepositRoot;
    if (isSameKeysOpIndex && isSameDepositRoot) return;

    this.logger.log('Updating node operators cache', {
      isSameKeysOpIndex,
      isSameDepositRoot,
    });

    const currentOperators = await this.getNodeOperatorsData(blockTag);
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
        const from = cachedOperator.usedSigningKeys;
        const to = operator.totalSigningKeys;

        // We get used keys from the cache, since the contract does not allow to change them
        const cachedUsedKeys = cachedOperator.keys.slice(0, from);
        const newKeys = await this.getNodeOperatorKeys(
          operatorId,
          from,
          to,
          blockTag,
        );
        keys = cachedUsedKeys.concat(newKeys);
      } else {
        const from = 0;
        const to = operator.totalSigningKeys;
        keys = await this.getNodeOperatorKeys(operatorId, from, to, blockTag);
      }

      this.logger.log('Operator keys are fetched', {
        operatorName: operator.name,
        keys: keys.length,
      });

      mergedOperators[operatorId] = { ...operator, keys };
    }

    await this.setCachedNodeOperatorsKeys({
      version: APP_VERSION,
      operators: mergedOperators,
      keysOpIndex: currentKeysOpIndex,
      depositRoot: currentDepositRoot,
    });
  }

  /**
   * Gets node operators data from cache
   */
  public async getCachedNodeOperators(): Promise<NodeOperatorsCache> {
    return await this.cacheService.getCache();
  }

  /**
   * Saves node operators data to cache
   */
  public async setCachedNodeOperatorsKeys(
    cache: NodeOperatorsCache,
  ): Promise<void> {
    return await this.cacheService.setCache(cache);
  }

  /**
   * Delete node operators cache
   */
  public async deleteCachedNodeOperatorsKeys(): Promise<void> {
    return await this.cacheService.deleteCache();
  }
}
