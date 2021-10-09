import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { RegistryAbi, RegistryAbi__factory } from 'generated';
import { ProviderService } from 'provider';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { getRegistryAddress, REGISTRY_KEYS_NUMBER } from './registry.constants';
import { LidoService } from 'lido';
import { splitHex } from 'utils';

@Injectable()
export class RegistryService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly providerService: ProviderService,
    private readonly lidoService: LidoService,
  ) {}

  private cachedContract: RegistryAbi | null = null;

  private async getContract(): Promise<RegistryAbi> {
    if (!this.cachedContract) {
      const address = await this.getRegistryAddress();
      const provider = this.providerService.provider;
      this.cachedContract = RegistryAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  private async splitPubKeys(hexString: string) {
    const contract = await this.getContract();
    const pubkeyLength = await contract.PUBKEY_LENGTH();

    return splitHex(hexString, pubkeyLength.toNumber());
  }

  public async getNextKeys() {
    const contract = await this.getContract();
    const [pubKeys] = await contract.callStatic.assignNextSigningKeys(
      REGISTRY_KEYS_NUMBER,
      { from: this.lidoService.getLidoAddress() },
    );

    return this.splitPubKeys(pubKeys);
  }

  public async getRegistryAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getRegistryAddress(chainId);
  }
}
