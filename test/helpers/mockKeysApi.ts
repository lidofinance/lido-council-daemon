import ethers from 'ethers';

import { KeysApiService } from '../../src/keys-api/keys-api.service';
import { SIMPLE_DVT, NOP_REGISTRY } from './../constants';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';
import { SRModule } from 'keys-api/interfaces';
import { ELBlockSnapshot } from 'keys-api/interfaces/ELBlockSnapshot';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

export const setupMockModules = (
  currentBlock: ethers.providers.Block,
  keysApiService: KeysApiService,
  mockedOperators: RegistryOperator[],
  mockedDvtOperators: RegistryOperator[],
  unusedKeys: RegistryKey[],
) => {
  const curatedModule = mockedModule(currentBlock, currentBlock.hash);
  const sdvtModule = mockedModuleDvt(currentBlock, currentBlock.hash);
  const meta = mockedMeta(currentBlock, currentBlock.hash);

  mockedKeysApiOperatorsMany(
    keysApiService,
    [
      { operators: mockedOperators, module: curatedModule },
      { operators: mockedDvtOperators, module: sdvtModule },
    ],
    meta,
  );

  mockedKeysApiGetAllKeys(keysApiService, unusedKeys, meta);

  return { curatedModule, sdvtModule, meta };
};

export const mockedModule = (
  block: ethers.providers.Block,
  lastChangedBlockHash: string,
  nonce = 6046,
): SRModule => ({
  nonce,
  type: 'curated-onchain-v1',
  id: 1,
  stakingModuleAddress: NOP_REGISTRY,
  moduleFee: 10,
  treasuryFee: 10,
  targetShare: 10,
  status: 1,
  name: 'NodeOperatorRegistry',
  lastDepositAt: block.timestamp,
  lastDepositBlock: block.number,
  lastChangedBlockHash,
  exitedValidatorsCount: 0,
  active: true,
});

export const mockedModuleDvt = (
  block: ethers.providers.Block,
  lastChangedBlockHash: string,
  nonce = 6046,
): SRModule => ({
  nonce,
  type: 'curated-onchain-v1',
  id: 2,
  stakingModuleAddress: SIMPLE_DVT,
  moduleFee: 10,
  treasuryFee: 10,
  targetShare: 10,
  status: 1,
  name: 'NodeOperatorRegistrySimpleDvt',
  lastDepositAt: block.timestamp,
  lastDepositBlock: block.number,
  lastChangedBlockHash,
  exitedValidatorsCount: 0,
  active: true,
});

export const mockedMeta = (
  block: ethers.providers.Block,
  lastChangedBlockHash: string,
) => ({
  blockNumber: block.number,
  blockHash: block.hash,
  timestamp: block.timestamp,
  lastChangedBlockHash,
});

export const mockOperator1 = {
  name: 'Dev team',
  rewardAddress: '0x6D725DAe055287f913661ee0b79dE6B21F12A459',
  stakingLimit: 12,
  stoppedValidators: 0,
  totalSigningKeys: 12,
  usedSigningKeys: 0,
  index: 0,
  active: true,
  moduleAddress: NOP_REGISTRY,
};

export const mockOperator2 = {
  name: 'Dev team',
  rewardAddress: '0x6D725DAe055287f913661ee0b79dE6B21F12A459',
  stakingLimit: 12,
  stoppedValidators: 0,
  totalSigningKeys: 12,
  usedSigningKeys: 0,
  index: 1,
  active: true,
  moduleAddress: NOP_REGISTRY,
};

export const mockedOperators: RegistryOperator[] = [
  mockOperator1,
  mockOperator2,
];

export const mockedDvtOperators: RegistryOperator[] = [
  {
    name: 'Dev DVT team',
    rewardAddress: '0x6D725DAe055287f913661ee0b79dE6B21F12A459',
    stakingLimit: 12,
    stoppedValidators: 0,
    totalSigningKeys: 12,
    usedSigningKeys: 0,
    index: 0,
    active: true,
    moduleAddress: SIMPLE_DVT,
  },
];

export const mockedKeysApiOperatorsMany = (
  keysApiService: KeysApiService,
  data: { operators: RegistryOperator[]; module: SRModule }[],
  mockedMeta: ELBlockSnapshot,
) => {
  jest
    .spyOn(keysApiService, 'getOperatorListWithModule')
    .mockImplementation(async () => ({
      data: data,
      meta: {
        elBlockSnapshot: mockedMeta,
      },
    }));
};

export const mockedKeysApiGetAllKeys = (
  keysApiService: KeysApiService,
  mockedKeys: RegistryKey[],
  mockedMeta: ELBlockSnapshot,
) => {
  jest.spyOn(keysApiService, 'getKeys').mockImplementation(async () => ({
    data: mockedKeys,
    meta: {
      elBlockSnapshot: mockedMeta,
    },
  }));
};

export const mockedKeysApiFind = (
  keysApiService: KeysApiService,
  mockedKeys: RegistryKey[],
  mockedMeta: ELBlockSnapshot,
) => {
  jest
    .spyOn(keysApiService, 'getKeysByPubkeys')
    .mockImplementation(async () => ({
      data: mockedKeys,
      meta: {
        elBlockSnapshot: mockedMeta,
      },
    }));
};
