import { Block } from '@ethersproject/abstract-provider';
import { CHAINS } from '@lido-sdk/constants';
import { Injectable } from '@nestjs/common';
import { RpcBatchProvider, RpcProvider } from './interfaces';

@Injectable()
export class ProviderService {
  constructor(
    public provider: RpcProvider,
    public batchProvider: RpcBatchProvider,
  ) {}

  /**
   * Returns a new instance of provider
   */
  public getNewProviderInstance(): RpcProvider {
    return this.provider.clone();
  }

  /**
   * Returns a new instance of batch provider
   */
  public getNewBatchProviderInstance(): RpcBatchProvider {
    return this.batchProvider.clone();
  }

  /**
   * Returns current chain id
   */
  public async getChainId(): Promise<number> {
    const { chainId } = await this.provider.getNetwork();
    return chainId;
  }

  /**
   * Returns current block number
   */
  public async getBlockNumber(): Promise<number> {
    const cachedBlockNumber = this.provider.blockNumber;

    return cachedBlockNumber === -1
      ? await this.provider.getBlockNumber()
      : cachedBlockNumber;
  }

  /**
   * Returns current block
   */
  public async getBlock(): Promise<Block> {
    return await this.provider.getBlock('latest');
  }

  /**
   * Returns network name
   */
  public async getNetworkName(): Promise<string> {
    const network = await this.provider.getNetwork();
    const name = CHAINS[network.chainId]?.toLocaleLowerCase();
    return name || network.name;
  }
}
