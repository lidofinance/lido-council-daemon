import { providers } from 'ethers';

export abstract class RpcProvider extends providers.JsonRpcProvider {
  clone(): RpcProvider {
    throw new Error('Method is not implemented');
  }
}

export abstract class RpcBatchProvider extends providers.JsonRpcBatchProvider {
  clone(): RpcBatchProvider {
    throw new Error('Method is not implemented');
  }
}
