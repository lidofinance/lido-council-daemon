import { Inject, Injectable, LoggerService } from '@nestjs/common';
import {
  KeyValidatorInterface,
  bufferFromHexString,
  WithdrawalCredentialsBuffer,
  Key,
} from '@lido-nestjs/key-validation';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { GENESIS_FORK_VERSION_BY_CHAIN_ID } from 'bls/bls.constants';
import { LRUCache } from 'lru-cache';
import { DEPOSIT_DATA_LRU_CACHE_SIZE } from './constants';
import { ProviderService } from 'provider';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

type DepositKey = RegistryKey & {
  withdrawalCredentials: WithdrawalCredentialsBuffer;
  genesisForkVersion: Buffer;
};

@Injectable()
export class KeysValidationService {
  private depositDataCache: LRUCache<string, boolean>;

  constructor(
    private readonly keyValidator: KeyValidatorInterface,
    private readonly provider: ProviderService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
  ) {
    this.depositDataCache = new LRUCache({ max: DEPOSIT_DATA_LRU_CACHE_SIZE });
  }

  /**
   * return list of invalid keys
   * @param keys
   * @param withdrawalCredentials
   */
  public async getInvalidKeys(
    keys: RegistryKey[],
    withdrawalCredentials: string,
  ): Promise<RegistryKey[]> {
    const withdrawalCredentialsBuffer = bufferFromHexString(
      withdrawalCredentials,
    );
    const genesisForkVersion: Uint8Array = await this.forkVersion();
    const genesisForkVersionBuffer = Buffer.from(genesisForkVersion.buffer);

    const { cachedInvalidKeyList, uncachedDepositKeyList } =
      this.partitionCachedData(
        keys,
        withdrawalCredentialsBuffer,
        genesisForkVersionBuffer,
      );

    this.logger.log('Validation status of deposit keys:', {
      cachedInvalidKeyCount: cachedInvalidKeyList.length,
      keysNeedingValidationCount: uncachedDepositKeyList.length,
      totalKeysCount: keys.length,
    });

    const validatedDepositKeyList: [DepositKey & Key, boolean][] =
      await this.keyValidator.validateKeys<DepositKey>(uncachedDepositKeyList);

    this.updateCache(validatedDepositKeyList);

    const invalidKeys = this.filterInvalidKeys(validatedDepositKeyList);

    return cachedInvalidKeyList.concat(invalidKeys);
  }

  private filterInvalidKeys(
    validatedKeys: [DepositKey & Key, boolean][],
  ): RegistryKey[] {
    return validatedKeys.reduce<RegistryKey[]>(
      (invalidKeys, [data, isValid]) => {
        if (!isValid) {
          invalidKeys.push({
            key: data.key,
            depositSignature: data.depositSignature,
            operatorIndex: data.operatorIndex,
            used: data.used,
            index: data.index,
            moduleAddress: data.moduleAddress,
            vetted: data.vetted,
          });
        }
        return invalidKeys;
      },
      [],
    );
  }

  /**
   * Partition the deposit data into cached invalid data and uncached data.
   * @param depositDataList List of deposit data to check against the cache
   * @returns An object containing cached invalid data and uncached data
   */
  private partitionCachedData(
    keys: RegistryKey[],
    withdrawalCredentialsBuffer: WithdrawalCredentialsBuffer,
    genesisForkVersionBuffer: Buffer,
  ): {
    cachedInvalidKeyList: RegistryKey[];
    uncachedDepositKeyList: DepositKey[];
  } {
    return keys.reduce<{
      cachedInvalidKeyList: RegistryKey[];
      uncachedDepositKeyList: DepositKey[];
    }>(
      (acc, key) => {
        const depositKey = {
          ...key,
          withdrawalCredentials: withdrawalCredentialsBuffer,
          genesisForkVersion: genesisForkVersionBuffer,
        };
        const cacheResult = this.getCachedDepositData(depositKey);

        if (cacheResult === false) {
          acc.cachedInvalidKeyList.push(key);
        }

        if (cacheResult === undefined) {
          acc.uncachedDepositKeyList.push(depositKey);
        }

        return acc;
      },
      { cachedInvalidKeyList: [], uncachedDepositKeyList: [] },
    );
  }

  private getCachedDepositData(depositKey: DepositKey): boolean | undefined {
    return this.depositDataCache.get(this.serializeDepositData(depositKey));
  }

  private async forkVersion(): Promise<Uint8Array> {
    const chainId = await this.provider.getChainId();
    const forkVersion = GENESIS_FORK_VERSION_BY_CHAIN_ID[chainId];

    if (!forkVersion) {
      throw new Error(`Unsupported chain id ${chainId}`);
    }

    return forkVersion;
  }

  private updateCache(validatedKeys: [Key & DepositKey, boolean][]) {
    validatedKeys.forEach(([depositData, isValid]) =>
      this.depositDataCache.set(
        this.serializeDepositData(depositData),
        isValid,
      ),
    );
  }

  private serializeDepositData(depositKey: DepositKey): string {
    return JSON.stringify({
      key: depositKey.key,
      depositSignature: depositKey.depositSignature,
      withdrawalCredentials: depositKey.withdrawalCredentials.toString('hex'),
      genesisForkVersion: depositKey.genesisForkVersion.toString('hex'),
    });
  }
}
