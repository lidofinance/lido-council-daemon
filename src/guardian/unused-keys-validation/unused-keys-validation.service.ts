import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { UnusedKeyData } from './interfaces/unused-key-data.interface';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BlsService } from 'bls';

@Injectable()
export class UnusedKeysValidationService {
  private store: Map<string, UnusedKeyData>;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private blsService: BlsService,
  ) {
    this.store = new Map<string, UnusedKeyData>();
  }

  /**
   *
   * @param keys unused keys we got for keys api
   * @returns List of keys with wrong BLS signature
   */
  validateAndCacheList(lidoWC: string, keys: RegistryKey[]): RegistryKey[] {
    const invalidKeys: RegistryKey[] = [];
    keys.forEach((key) => {
      if (!this.validateAndCacheKey(lidoWC, key)) {
        // key is invalid
        invalidKeys.push(key);
      }
    });

    return invalidKeys;
  }

  // Adds a new element or updates it if it already exists
  validateAndCacheKey(lidoWC: string, key: RegistryKey): boolean {
    const data = this.store.get(key.key);

    if (data) {
      // Update the element only if the signature has changed
      if (data.depositSignature !== key.depositSignature) {
        data.depositSignature = key.depositSignature;
        data.isValid = this.validate(lidoWC, key.key, key.depositSignature);

        return data.isValid;
      }

      return data.isValid;
    } else {
      // Add information about new unused key
      const isValid = this.validate(lidoWC, key.key, key.depositSignature);
      this.store.set(key.key, {
        operatorIndex: key.operatorIndex,
        depositSignature: key.depositSignature,
        isValid: isValid,
      });

      return isValid;
    }
  }

  validate(lidoWC: string, pubkey: string, signature: string): boolean {
    const depositData = {
      pubkey,
      wc: lidoWC,
      amount: this.ethAmountInWeiHex(32),
      signature,
    };

    return this.blsService.verify(depositData);
  }

  ethAmountInWeiHex(eth: number) {
    const amountInWei = BigInt(eth) * BigInt(10 ** 18);
    return amountInWei.toString(16);
  }
}
