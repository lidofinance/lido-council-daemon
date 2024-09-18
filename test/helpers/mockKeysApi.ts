import ethers from 'ethers';

import { KeysApiService } from '../../src/keys-api/keys-api.service';
import { SIMPLE_DVT, NOP_REGISTRY } from './../constants';
import { SRModule } from 'keys-api/interfaces';
import { ELBlockSnapshot } from 'keys-api/interfaces/ELBlockSnapshot';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

export const mockedModuleCurated: SRModule = {
  type: 'curated-onchain-v1',
  id: 1,
  stakingModuleAddress: NOP_REGISTRY,
  moduleFee: 10,
  treasuryFee: 10,
  targetShare: 10,
  status: 1,
  name: 'NodeOperatorRegistry',
  lastDepositAt: 1234345657,
  lastDepositBlock: 12345,
  lastChangedBlockHash: '',
  nonce: 6046,
  exitedValidatorsCount: 0,
  active: true,
};

export const mockedModuleDvt: SRModule = {
  type: 'curated-onchain-v1',
  id: 2,
  stakingModuleAddress: SIMPLE_DVT,
  moduleFee: 10,
  treasuryFee: 10,
  targetShare: 10,
  status: 1,
  name: 'NodeOperatorRegistrySimpleDvt',
  lastDepositAt: 1234345657,
  lastDepositBlock: 12345,
  lastChangedBlockHash: '',
  nonce: 6046,
  exitedValidatorsCount: 0,
  active: true,
};

export const mockMeta = (
  block: ethers.providers.Block,
  lastChangedBlockHash: string,
) => ({
  blockNumber: block.number,
  blockHash: block.hash,
  timestamp: block.timestamp,
  lastChangedBlockHash,
});

export const keysApiMockGetModules = (
  keysApiService: KeysApiService,
  modules: SRModule[],
  meta: ELBlockSnapshot,
) => {
  jest.spyOn(keysApiService, 'getModules').mockImplementation(async () => ({
    data: modules,
    elBlockSnapshot: meta,
  }));
};

export const keysApiMockGetAllKeys = (
  keysApiService: KeysApiService,
  keys: RegistryKey[],
  meta: ELBlockSnapshot,
) => {
  jest.spyOn(keysApiService, 'getKeys').mockImplementation(async () => ({
    data: keys,
    meta: {
      elBlockSnapshot: meta,
    },
  }));
};

export const mockedKeysApiFind = (
  keysApiService: KeysApiService,
  keys: RegistryKey[],
  meta: ELBlockSnapshot,
) => {
  jest
    .spyOn(keysApiService, 'getKeysByPubkeys')
    .mockImplementation(async () => ({
      data: keys,
      meta: {
        elBlockSnapshot: meta,
      },
    }));
};
