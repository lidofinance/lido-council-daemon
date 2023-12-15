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
import { ProviderService } from 'provider';
import { GENESIS_FORK_VERSION_BY_CHAIN_ID } from 'bls/bls.constants';
import { LRUCache } from 'lru-cache';
import { KEYS_LRU_CACHE_SIZE } from './constants';

type DepositData = {
  key: Pubkey;
  depositSignature: string;
  withdrawalCredentials: WithdrawalCredentialsBuffer;
  genesisForkVersion: Buffer;
};

@Injectable()
export class KeysValidationService {
  private keysCache: LRUCache<string, { signature: string; isValid: boolean }>;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    protected readonly logger: LoggerService,
    private readonly keyValidator: KeyValidatorInterface,
    private readonly provider: ProviderService,
  ) {
    this.keysCache = new LRUCache({ max: KEYS_LRU_CACHE_SIZE });
  }

  /**
   *
   * Return list of invalid keys
   */
  async validateKeys(
    vettedKeys: RegistryKey[],
    withdrawalCredentials: string,
  ): Promise<{ key: string; depositSignature: string }[]> {
    const forkVersion: Uint8Array = await this.forkVersion();

    const keysForValidation = vettedKeys
      .map((key) =>
        this.prepareKeyForValidation(key, withdrawalCredentials, forkVersion),
      )
      .filter((key) => key !== undefined) as DepositData[];

    const validatedKeys: [Key & DepositData, boolean][] =
      await this.keyValidator.validateKeys(keysForValidation);

    this.updateCacheWithValidationResults(validatedKeys);

    // this list will not include invalid keys from cache
    const invalidKeysFromCurrentValidation = validatedKeys
      .filter(([, isValid]) => !isValid)
      .map(([key]) => ({
        key: key.key,
        depositSignature: key.depositSignature,
      }));

    return this.mergeInvalidKeys(vettedKeys, invalidKeysFromCurrentValidation);
  }

  prepareKeyForValidation(
    key: RegistryKey,
    withdrawalCredentials: string,
    forkVersion: Uint8Array,
  ) {
    const cachedEntry = this.keysCache.get(key.key);

    // key wasn't in cache or signature was changed
    if (cachedEntry && cachedEntry.signature == key.depositSignature) {
      return undefined;
    }

    return this.depositData(key, withdrawalCredentials, forkVersion);
  }

  depositData(
    key: RegistryKey,
    withdrawalCredentials: string,
    forkVersion: Uint8Array,
  ): DepositData {
    return {
      key: key.key,
      depositSignature: key.depositSignature,
      withdrawalCredentials: bufferFromHexString(withdrawalCredentials),
      genesisForkVersion: Buffer.from(forkVersion.buffer),
    };
  }

  async forkVersion(): Promise<Uint8Array> {
    const chainId = await this.provider.getChainId();
    const forkVersion = GENESIS_FORK_VERSION_BY_CHAIN_ID[chainId];

    if (!forkVersion) {
      throw new Error(`Unsupported chain id ${chainId}`);
    }

    return forkVersion;
  }

  async updateCacheWithValidationResults(
    validatedKeys: [Key & DepositData, boolean][],
  ) {
    validatedKeys.forEach(([key, isValid]) =>
      this.keysCache.set(key.key, { signature: key.depositSignature, isValid }),
    );
  }

  private mergeInvalidKeys(
    vettedKeys: RegistryKey[],
    recentInvalidKeys: { key: string; depositSignature: string }[],
  ): { key: string; depositSignature: string }[] {
    const allInvalidKeys = new Map<
      string,
      { key: string; depositSignature: string }
    >();

    // Add invalid keys from the current validation
    for (const key of recentInvalidKeys) {
      allInvalidKeys.set(key.key, key);
    }

    const newInvalidKeys = allInvalidKeys.size;
    this.logger.log('New invalid keys', allInvalidKeys.size);

    // want to add invalid keys from cache that we have in current list of vetted keys
    vettedKeys.forEach((vettedKey) => {
      const cachedEntry = this.keysCache.get(vettedKey.key);
      if (
        cachedEntry &&
        !cachedEntry.isValid &&
        !allInvalidKeys.has(vettedKey.key)
      ) {
        allInvalidKeys.set(vettedKey.key, {
          key: vettedKey.key,
          depositSignature: cachedEntry.signature,
        });
      }
    });

    this.logger.log(
      'Invalid keys from cache',
      allInvalidKeys.size - newInvalidKeys,
    );

    return Array.from(allInvalidKeys.values());
  }
}
