import { CHAINS } from '@lido-sdk/constants';
import { NodeOperatorsCache } from './interfaces';

export const REGISTRY_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
  [CHAINS.Goerli]: '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320',
};

export const getRegistryAddress = (chainId: CHAINS): string => {
  const address = REGISTRY_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};

export const REGISTRY_KEYS_QUERY_BATCH_SIZE = 200;
export const REGISTRY_KEYS_CACHE_UPDATE_BLOCK_RATE = 20;

export const REGISTRY_CACHE_FILE_NAME = 'registry.keys.json';

export const REGISTRY_CACHE_DEFAULT: NodeOperatorsCache = Object.freeze({
  depositRoot: '-0x1',
  keysOpIndex: -1,
  operators: [],
  keys: [],
});
