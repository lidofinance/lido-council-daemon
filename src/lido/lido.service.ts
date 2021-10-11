import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { ProviderService } from 'provider';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { getLidoAddress } from 'lido';
import { LidoAbi, LidoAbi__factory } from 'generated';

@Injectable()
export class LidoService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
  ) {}

  private cachedContract: LidoAbi | null = null;

  private async getContract(): Promise<LidoAbi> {
    if (!this.cachedContract) {
      const address = await this.getLidoAddress();
      const provider = this.providerService.provider;
      this.cachedContract = LidoAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  public async getLidoAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getLidoAddress(chainId);
  }

  public async getDepositContractAddress() {
    const contract = await this.getContract();
    const address = await contract.getDepositContract();

    return address;
  }
}
