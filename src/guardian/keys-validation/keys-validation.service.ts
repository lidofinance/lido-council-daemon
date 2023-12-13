import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  KeyValidatorInterface,
  bufferFromHexString,
} from '@lido-nestjs/key-validation';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { ProviderService } from 'provider';
import { GENESIS_FORK_VERSION_BY_CHAIN_ID } from 'bls/bls.constants';
import { LidoService } from 'contracts/lido';

@Injectable()
export class KeysValidationService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    protected readonly logger: LoggerService,
    private readonly keyValidator: KeyValidatorInterface,
    private readonly provider: ProviderService,
    private readonly lidoService: LidoService,
  ) {}

  /**
   *
   * Return list of invalid keys
   */
  async validateKeys(
    unusedKeys: RegistryKey[],
    // withdrawalCredentials: string,
  ): Promise<{ key: string; depositSignature: string }[]> {
    this.logger.log('Start keys validation', { keysCount: unusedKeys.length });
    const forkVersion: Uint8Array = await this.forkVersion();
    const withdrawalCredentials = await this.withdrawalCredentials();

    const validatedKeys: [
      {
        key: string;
        depositSignature: string;
        used: boolean;
      },
      boolean,
    ][] = await this.keyValidator.validateKeys(
      unusedKeys.map((key) => ({
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
    // TODO: check chainId
    const chainId = await this.provider.getChainId();
    return GENESIS_FORK_VERSION_BY_CHAIN_ID[chainId];
  }

  async withdrawalCredentials() {
    return await this.lidoService.getWithdrawalCredentials();
  }
}
