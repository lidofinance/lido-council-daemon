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
    const cachedBlockNumber = this.provider.blockNumber;

    return cachedBlockNumber === -1
      ? await this.provider.getBlockNumber()
      : cachedBlockNumber;
  }

  public async getBlock(): Promise<Block> {
    return await this.provider.getBlock('latest');
  }
}
