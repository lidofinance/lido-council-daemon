import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  KeyValidatorInterface,
  bufferFromHexString,
} from '@lido-nestjs/key-validation';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { ProviderService } from 'provider';
import { GENESIS_FORK_VERSION_BY_CHAIN_ID } from 'bls/bls.constants';

@Injectable()
export class KeysValidationService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    protected readonly logger: LoggerService,
    private readonly keyValidator: KeyValidatorInterface,
    private readonly provider: ProviderService,
  ) {}

  /**
   *
   * Return list of invalid keys
   */
  async validateKeys(
    vettedKeys: RegistryKey[],
    withdrawalCredentials: string,
  ): Promise<{ key: string; depositSignature: string }[]> {
    const forkVersion: Uint8Array = await this.forkVersion();

    const validatedKeys: [
      {
        key: string;
        depositSignature: string;
        used: boolean;
      },
      boolean,
    ][] = await this.keyValidator.validateKeys(
      vettedKeys.map((key) => ({
        key: key.key,
        depositSignature: key.depositSignature,
        used: false,
        withdrawalCredentials: bufferFromHexString(withdrawalCredentials),
        genesisForkVersion: Buffer.from(forkVersion.buffer),
      })),
    );

    return validatedKeys
      .filter(([, result]) => !result)
      .map(([key]) => ({
        key: key.key,
        depositSignature: key.depositSignature,
      }));
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
