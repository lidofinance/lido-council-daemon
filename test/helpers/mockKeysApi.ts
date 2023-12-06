import ethers from 'ethers';
import { toHexString } from '@chainsafe/ssz';

import { KeysApiService } from '../../src/keys-api/keys-api.service';
import { NOP_REGISTRY, pk } from './../constants';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';

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
    moduleAddress: NOP_REGISTRY,
  }));

  const mockedOperators: RegistryOperator[] = [
    {
      name: 'Dev team',
      rewardAddress: '0x6D725DAe055287f913661ee0b79dE6B21F12A459',
      stakingLimit: 11,
      stoppedValidators: 0,
      totalSigningKeys: 10,
      usedSigningKeys: 10,
      index: 0,
      active: true,
      moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
    },
  ];

  jest.spyOn(keysApiService, 'getUnusedKeys').mockImplementation(async () => ({
    data: mockedKeys,
    meta: {
      elBlockSnapshot: mockedMeta,
    },
  }));

  jest
    .spyOn(keysApiService, 'getOperatorListWithModule')
    .mockImplementation(async () => ({
      data: [{ operators: mockedOperators, module: mockedModule }],
      meta: {
        elBlockSnapshot: mockedMeta,
      },
    }));
};
