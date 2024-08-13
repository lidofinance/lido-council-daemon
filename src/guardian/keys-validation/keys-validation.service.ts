import { Injectable } from '@nestjs/common';
import {
  KeyValidatorInterface,
  bufferFromHexString,
  Pubkey,
  WithdrawalCredentialsBuffer,
  Key,
} from '@lido-nestjs/key-validation';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { GENESIS_FORK_VERSION_BY_CHAIN_ID } from 'bls/bls.constants';
import { LRUCache } from 'lru-cache';
import { DEPOSIT_DATA_LRU_CACHE_SIZE } from './constants';
import { ProviderService } from 'provider';

type DepositData = {
  key: Pubkey;
  depositSignature: string;
  withdrawalCredentials: WithdrawalCredentialsBuffer;
  genesisForkVersion: Buffer;
};

@Injectable()
export class KeysValidationService {
  private depositDataCache: LRUCache<string, boolean>;

  constructor(
    private readonly keyValidator: KeyValidatorInterface,
    private readonly provider: ProviderService,
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
    const depositDataList = this.createDepositDataList(
      keys,
      withdrawalCredentialsBuffer,
      genesisForkVersionBuffer,
    );
    return await this.findInvalidKeys(keys, depositDataList);
  }

  async findInvalidKeys(
    keys: RegistryKey[],
    depositDataList: DepositData[],
  ): Promise<RegistryKey[]> {
    const validatedKeys = await this.validateKeys(depositDataList);

    return validatedKeys.reduce<RegistryKey[]>(
      (invalidKeys, [data, isValid]) => {
        if (!isValid) {
          const matchingInvalidKeys = keys.filter(
            (key) =>
              key.key === data.key &&
              key.depositSignature === data.depositSignature,
          );
          invalidKeys.push(...matchingInvalidKeys);
        }
        return invalidKeys;
      },
      [],
    );
  }

  /*
   * Validate data with use of cache
   */
  public async validateKeys(
    depositDataList: DepositData[],
  ): Promise<[Key & DepositData, boolean][]> {
    const { cachedDepositData, uncachedDepositData } =
      this.partitionCachedData(depositDataList);

    const validatedDepositData: [Key & DepositData, boolean][] =
      await this.keyValidator.validateKeys(uncachedDepositData);

    this.updateCache(validatedDepositData);

    return [...cachedDepositData, ...validatedDepositData];
  }

  /**
   * Partition the deposit data into cached invalid data and uncached data.
   * @param depositDataList List of deposit data to check against the cache
   * @returns An object containing cached invalid data and uncached data
   */
  private partitionCachedData(depositDataList: DepositData[]): {
    cachedDepositData: [DepositData, boolean][];
    uncachedDepositData: DepositData[];
  } {
    return depositDataList.reduce<{
      cachedDepositData: [DepositData, boolean][];
      uncachedDepositData: DepositData[];
    }>(
      (acc, depositData) => {
        const cacheResult = this.getCachedDepositData(depositData);

        if (cacheResult === false || cacheResult === true) {
          acc.cachedDepositData.push([depositData, cacheResult]);
        }

        if (cacheResult === undefined) {
          acc.uncachedDepositData.push(depositData);
        }

        return acc;
      },
      { cachedDepositData: [], uncachedDepositData: [] },
    );
  }

  private getCachedDepositData(depositData: DepositData): boolean | undefined {
    return this.depositDataCache.get(this.serializeDepositData(depositData));
  }

  private async forkVersion(): Promise<Uint8Array> {
    const chainId = await this.provider.getChainId();
    const forkVersion = GENESIS_FORK_VERSION_BY_CHAIN_ID[chainId];

    if (!forkVersion) {
      throw new Error(`Unsupported chain id ${chainId}`);
    }

    return forkVersion;
  }

  private async updateCache(validatedKeys: [Key & DepositData, boolean][]) {
    validatedKeys.forEach(([depositData, isValid]) =>
      this.depositDataCache.set(
        this.serializeDepositData(depositData),
        isValid,
      ),
    );
  }

  private serializeDepositData(depositData: DepositData): string {
    return JSON.stringify({
      ...depositData,
      withdrawalCredentials: depositData.withdrawalCredentials.toString('hex'),
      genesisForkVersion: depositData.genesisForkVersion.toString('hex'),
    });
  }

  private createDepositDataList(
    keys: RegistryKey[],
    withdrawalCredentialsBuffer: WithdrawalCredentialsBuffer,
    genesisForkVersionBuffer: Buffer,
  ): DepositData[] {
    return keys.map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
      withdrawalCredentials: withdrawalCredentialsBuffer,
      genesisForkVersion: genesisForkVersionBuffer,
    }));
  }
}
