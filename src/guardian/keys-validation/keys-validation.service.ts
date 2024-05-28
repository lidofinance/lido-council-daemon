import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
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
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly keyValidator: KeyValidatorInterface,
    private readonly provider: ProviderService,
  ) {
    this.depositDataCache = new LRUCache({ max: DEPOSIT_DATA_LRU_CACHE_SIZE });
  }

  /**
   * return list of invalid keys
   * we consider in this method that there are only unique {key, depositSignature} data
   * @param vettedKeys
   * @param withdrawalCredentials
   */
  public async getInvalidKeys(
    vettedKeys: RegistryKey[],
    withdrawalCredentials: string,
  ): Promise<RegistryKey[]> {
    const withdrawalCredentialsBuffer = bufferFromHexString(
      withdrawalCredentials,
    );
    const genesisForkVersion: Uint8Array = await this.forkVersion();
    const genesisForkVersionBuffer = Buffer.from(genesisForkVersion.buffer);
    const depositDataList = vettedKeys.map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
      withdrawalCredentials: withdrawalCredentialsBuffer,
      genesisForkVersion: genesisForkVersionBuffer,
    }));
    const validatedKeys = await this.validateKeys(depositDataList);

    const invalidKeys: (RegistryKey | undefined)[] = validatedKeys
      .filter((item) => !item[1])
      .map((item) => {
        return vettedKeys.find(
          (key) =>
            key.key == item[0].key &&
            key.depositSignature == item[0].depositSignature,
        );
      });

    return invalidKeys.filter((key): key is RegistryKey => key !== undefined);
  }

  /*
   * Validate data with use of cache
   */
  public async validateKeys(
    depositDataList: DepositData[],
  ): Promise<[Key & DepositData, boolean][]> {
    const cachedDepositData = this.getCachedDepositData(depositDataList);
    const cachedInvalidData: [DepositData, false][] = cachedDepositData.filter(
      (item): item is [DepositData, false] => item[1] === false,
    );
    const notCachedDepositData: DepositData[] = cachedDepositData
      .filter((item) => item[1] === undefined)
      .map((item) => item[0]);

    const validatedDepositData: [Key & DepositData, boolean][] =
      await this.keyValidator.validateKeys(notCachedDepositData);

    this.updateCache(validatedDepositData);

    return [...cachedInvalidData, ...validatedDepositData];
  }

  /**
   * Found keys in cache and return list of tuples with validation result
   * If key haven't been validated yet, return undefined
   */
  private getCachedDepositData(
    depositListData: DepositData[],
  ): [DepositData, boolean | undefined][] {
    return depositListData.map((depositData) => [
      depositData,
      this.depositDataCache.get(this.serializeDepositData(depositData)),
    ]);
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
}
