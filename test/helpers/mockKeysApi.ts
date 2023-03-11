import ethers from 'ethers';
import { toHexString } from '@chainsafe/ssz';

import { KeysApiService } from '../../src/keys-api/keys-api.service';
import { NOP_REGISTRY, pk } from './../constants';

export const mockKeysApi = (
  sig: Uint8Array[],
  block: ethers.providers.Block,
  keysApiService: KeysApiService,
  used = false,
) => {
  const mockedModule = {
    nonce: 6046,
    type: 'grouped-onchain-v1',
    id: 1,
    stakingModuleAddress: NOP_REGISTRY,
    moduleFee: 10,
    treasuryFee: 10,
    targetShare: 10,
    status: 1,
    name: 'NodeOperatorRegistry',
    lastDepositAt: block.timestamp,
    lastDepositBlock: block.number,
  };

  const mockedMeta = {
    blockNumber: block.number,
    blockHash: block.hash,
    timestamp: block.timestamp,
  };

  const mockedKeys = sig.map((x) => ({
    key: toHexString(pk),
    depositSignature: toHexString(x),
    operatorIndex: 0,
    used,
    index: 0,
  }));

  jest.spyOn(keysApiService, 'getModulesList').mockImplementation(async () => ({
    data: [mockedModule],
    elBlockSnapshot: mockedMeta,
  }));

  jest
    .spyOn(keysApiService, 'getUnusedModuleKeys')
    .mockImplementation(async () => ({
      data: {
        keys: mockedKeys,
        module: mockedModule,
      },
      meta: {
        elBlockSnapshot: mockedMeta,
      },
    }));
};
