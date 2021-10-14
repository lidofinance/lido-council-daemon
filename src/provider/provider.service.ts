import { Injectable } from '@nestjs/common';
import { Block, JsonRpcProvider } from '@ethersproject/providers';

@Injectable()
export class ProviderService {
  constructor(public provider: JsonRpcProvider) {}

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
