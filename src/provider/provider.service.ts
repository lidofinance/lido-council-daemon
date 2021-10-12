import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StaticJsonRpcProvider, Block } from '@ethersproject/providers';

@Injectable()
export class ProviderService {
  constructor(private configService: ConfigService) {}

  private cachedProvider: StaticJsonRpcProvider | null = null;

  public get rpcUrl(): string {
    return this.configService.get<string>('RPC_URL');
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
