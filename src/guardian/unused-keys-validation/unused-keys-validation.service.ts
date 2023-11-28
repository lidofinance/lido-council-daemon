import { Injectable } from '@nestjs/common';
// import { UnusedKeyData } from './interfaces/unused-key-data.interface';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { BlsService } from 'bls';

export type UnusedKeyData = {
  operatorIndex: number;
  depositSignature: string;
  isValid: boolean;
  index: number;
  moduleAddress: string;
};

@Injectable()
export class UnusedKeysValidationService {
  private store: Map<string, UnusedKeyData>;

  constructor(private blsService: BlsService) {
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

  private isDataDifferent(data, key) {
    return (
      data.depositSignature !== key.depositSignature ||
      data.operatorIndex != key.operatorIndex ||
      data.index != key.index ||
      data.moduleAddress != key.moduleAddress
    );
  }

  // Adds a new element or updates it if it already exists
  validateAndCacheKey(lidoWC: string, key: RegistryKey): boolean {
    console.log('validateAndCacheKey');
    const data = this.store.get(key.key);

    if (data) {
      // Update the element only if the signature has changed
      if (this.isDataDifferent(data, key)) {
        const isValid = this.validate(lidoWC, key.key, key.depositSignature);
        this.store.set(key.key, {
          operatorIndex: key.operatorIndex,
          depositSignature: key.depositSignature,
          isValid,
          index: key.index,
          moduleAddress: key.moduleAddress,
        });

        return isValid;
      }

      return data.isValid;
    } else {
      // Add information about new unused key
      const isValid = this.validate(lidoWC, key.key, key.depositSignature);
      this.store.set(key.key, {
        operatorIndex: key.operatorIndex,
        depositSignature: key.depositSignature,
        isValid,
        index: key.index,
        moduleAddress: key.moduleAddress,
      });

      return isValid;
    }
  }

  validate(lidoWC: string, pubkey: string, signature: string): boolean {
    const depositData = {
      pubkey,
      wc: lidoWC,
      amount: '0x0040597307000000',
      signature,
    };

    return this.blsService.verify(depositData);
  }

  clearCache(): void {
    this.store.clear();
  }
}
