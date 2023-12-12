import ethers from 'ethers';

import { KeysApiService } from '../../src/keys-api/keys-api.service';
import { NOP_REGISTRY } from './../constants';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';
import { SRModule } from 'keys-api/interfaces';
import { ELBlockSnapshot } from 'keys-api/interfaces/ELBlockSnapshot';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

export const mockedModule = (block: ethers.providers.Block) => ({
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
});

export const mockedMeta = (block: ethers.providers.Block) => ({
  blockNumber: block.number,
  blockHash: block.hash,
  timestamp: block.timestamp,
});

export const mockedOperators: RegistryOperator[] = [
  {
    name: 'Dev team',
    rewardAddress: '0x6D725DAe055287f913661ee0b79dE6B21F12A459',
    stakingLimit: 12,
    stoppedValidators: 0,
    totalSigningKeys: 12,
    usedSigningKeys: 10,
    index: 0,
    active: true,
    moduleAddress: NOP_REGISTRY,
  },
];

export const mockedKeysApiOperators = (
  keysApiService: KeysApiService,
  mockedOperators: RegistryOperator[],
  mockedModule: SRModule,
  mockedMeta: ELBlockSnapshot,
) => {
  jest
    .spyOn(keysApiService, 'getOperatorListWithModule')
    .mockImplementation(async () => ({
      data: [{ operators: mockedOperators, module: mockedModule }],
      meta: {
        elBlockSnapshot: mockedMeta,
      },
    }));
};

export const mockedKeysApiUnusedKeys = (
  keysApiService: KeysApiService,
  mockedKeys: RegistryKey[],
  mockedMeta: ELBlockSnapshot,
) => {
  jest.spyOn(keysApiService, 'getUnusedKeys').mockImplementation(async () => ({
    data: mockedKeys,
    meta: {
      elBlockSnapshot: mockedMeta,
    },
  }));
};

export const mockedKeysWithDuplicates = (
  keysApiService: KeysApiService,
  mockedKeys: RegistryKey[],
  mockedMeta: ELBlockSnapshot,
) => {
  jest
    .spyOn(keysApiService, 'getKeysWithDuplicates')
    .mockImplementation(async () => ({
      data: mockedKeys,
      meta: {
        elBlockSnapshot: mockedMeta,
      },
    }));
};
