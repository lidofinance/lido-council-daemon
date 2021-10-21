import {
  JsonRpcBatchProvider,
  JsonRpcProvider,
} from '@ethersproject/providers';

export abstract class RpcProvider extends JsonRpcProvider {
  clone(): RpcProvider {
    throw new Error('Method is not implemented');
  }
}

export abstract class RpcBatchProvider extends JsonRpcBatchProvider {
  clone(): RpcBatchProvider {
    throw new Error('Method is not implemented');
  }
}
