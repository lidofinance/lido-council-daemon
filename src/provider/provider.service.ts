import { Injectable } from '@nestjs/common';
import { StaticJsonRpcProvider, Block } from '@ethersproject/providers';
import { Configuration } from 'common/config';

@Injectable()
export class ProviderService {
  constructor(private config: Configuration) {}

  private cachedProvider: StaticJsonRpcProvider | null = null;

  public get rpcUrl(): string {
    return this.config.RPC_URL;
  }

  public get provider(): StaticJsonRpcProvider {
    if (!this.cachedProvider) {
      this.cachedProvider = new StaticJsonRpcProvider(this.rpcUrl);
    }

    return this.cachedProvider;
  }

  public async getChainId(): Promise<number> {
    const { chainId } = await this.provider.getNetwork();
    return chainId;
  }

  public async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  public async getBlock(): Promise<Block> {
    return await this.provider.getBlock('latest');
  }
}
