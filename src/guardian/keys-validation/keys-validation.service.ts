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
import { KEYS_LRU_CACHE_SIZE } from './constants';
import { ProviderService } from 'provider';

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
  public async getInvalidKeys(
    vettedKeys: RegistryKey[],
    withdrawalCredentials: string,
  ): Promise<{ key: string; depositSignature: string }[]> {
    const forkVersion: Uint8Array = await this.forkVersion();

    const { keysNeedingValidation, unchangedAndInvalidKeys } =
      this.divideKeys(vettedKeys);

    const keysForValidation = keysNeedingValidation.map((key) =>
      this.toDepositData(key, withdrawalCredentials, forkVersion),
    );

    const validatedKeys: [Key & DepositData, boolean][] =
      await this.keyValidator.validateKeys(keysForValidation);

    this.updateCache(validatedKeys);

    // this list will not include invalid keys from cache
    const invalidKeysFromCurrentValidation = validatedKeys
      .filter(([, isValid]) => !isValid)
      .map(([key]) => ({
        key: key.key,
        depositSignature: key.depositSignature,
      }));

    this.logger.log('Validation keys information', {
      vettedKeysCount: vettedKeys.length,
      currentCacheSize: this.keysCache.size,
      cacheInvalidKeysCount: unchangedAndInvalidKeys.length,
      newInvalidKeys: invalidKeysFromCurrentValidation.length,
    });

    const unchangedAndInvalidKeysValues = unchangedAndInvalidKeys.map(
      (key) => ({
        key: key.key,
        depositSignature: key.depositSignature,
      }),
    );

    // merge just checked invalid keys and invalid keys from cache but only from vettedKeys
    return [
      ...invalidKeysFromCurrentValidation,
      ...unchangedAndInvalidKeysValues,
    ];
  }

  // TODO: rename
  private divideKeys(vettedKeys: RegistryKey[]): {
    keysNeedingValidation: RegistryKey[];
    unchangedAndInvalidKeys: RegistryKey[];
  } {
    const keysNeedingValidation: RegistryKey[] = [];
    const unchangedAndInvalidKeys: RegistryKey[] = [];

    vettedKeys.forEach((key) => {
      const cachedEntry = this.keysCache.get(key.key);

      if (!cachedEntry || cachedEntry.signature !== key.depositSignature) {
        keysNeedingValidation.push(key);
      } else if (!cachedEntry.isValid) {
        unchangedAndInvalidKeys.push(key);
      }
    });

    return { keysNeedingValidation, unchangedAndInvalidKeys };
  }

  private toDepositData(
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

  private async forkVersion(): Promise<Uint8Array> {
    const chainId = await this.provider.getChainId();
    const forkVersion = GENESIS_FORK_VERSION_BY_CHAIN_ID[chainId];

    if (!forkVersion) {
      throw new Error(`Unsupported chain id ${chainId}`);
    }

    return forkVersion;
  }

  private async updateCache(validatedKeys: [Key & DepositData, boolean][]) {
    validatedKeys.forEach(([key, isValid]) =>
      this.keysCache.set(key.key, { signature: key.depositSignature, isValid }),
    );
  }
}
