import { Block } from '@ethersproject/abstract-provider';
import { Injectable } from '@nestjs/common';
import { RpcBatchProvider, RpcProvider } from './interfaces';

@Injectable()
export class ProviderService {
  constructor(
    public provider: RpcProvider,
    public batchProvider: RpcBatchProvider,
  ) {}

  public getNewProviderInstance(): RpcProvider {
    return this.provider.clone();
  }

  public getNewBatchProviderInstance(): RpcBatchProvider {
    return this.batchProvider.clone();
  }

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
