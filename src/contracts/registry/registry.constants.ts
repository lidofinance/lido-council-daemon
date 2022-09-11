import { NodeOperatorsCache } from './interfaces';

export const REGISTRY_KEYS_CACHE_UPDATE_BLOCK_RATE = 20;

export const REGISTRY_CACHE_FILE_NAME = 'registry.keys.json';

export const REGISTRY_CACHE_DEFAULT: NodeOperatorsCache = Object.freeze({
  version: '-1',
  depositRoot: '-0x1',
  keysOpIndex: -1,
  operators: [],
  keys: [],
});
