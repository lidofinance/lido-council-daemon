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
  private keysCache: LRUCache<string, string>;

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
      .map((key) => {
        return this.getKeyFromCache(key, withdrawalCredentials, forkVersion);
      })
      .filter((key): key is DepositData => key !== undefined) as DepositData[];

    const validatedKeys: [Key & DepositData, boolean][] =
      await this.keyValidator.validateKeys(keysForValidation);

    this.updateCache(validatedKeys);

    return validatedKeys
      .filter(([, result]) => !result)
      .map(([key]) => ({
        key: key.key,
        depositSignature: key.depositSignature,
      }));
  }

  getKeyFromCache(
    key: RegistryKey,
    withdrawalCredentials: string,
    forkVersion: Uint8Array,
  ) {
    const sign = this.keysCache.get(key.key);

    if (sign == key.depositSignature) {
      // key was not changed
      return undefined;
    }
    return this.depositData(key, withdrawalCredentials, forkVersion);
  }

  async updateCache(validatedKeys: [Key & DepositData, boolean][]) {
    // keys doesnt exist in cache or that we need to update
    validatedKeys.forEach(([key, _]) =>
      this.keysCache.set(key.key, key.depositSignature),
    );
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
}
