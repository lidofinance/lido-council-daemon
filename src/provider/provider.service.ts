import { Injectable } from '@nestjs/common';
import { StaticJsonRpcProvider } from '@ethersproject/providers';
import { Configuration } from '../common/config/configuration';

@Injectable()
export class ProviderService {
  constructor(private config: Configuration) {}

  private cachedProvider: StaticJsonRpcProvider | null = null;

  public get rpcUrl(): string {
    return this.config.RPC_URL;
  }

  private getProvider(): StaticJsonRpcProvider {
    if (!this.cachedProvider) {
      this.cachedProvider = new StaticJsonRpcProvider(this.rpcUrl);
    }

    return this.cachedProvider;
  }

  public get provider(): StaticJsonRpcProvider {
    return this.getProvider();
  }

  public async getChainId(): Promise<number> {
    const { chainId } = await this.provider.getNetwork();
    return chainId;
  }
}
