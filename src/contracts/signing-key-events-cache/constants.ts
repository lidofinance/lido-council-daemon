import { CHAINS } from '@lido-sdk/constants';

export const SIGNING_KEYS_CACHE_DEFAULT = Object.freeze({
  headers: {
    version: '-1',
    startBlock: 0,
    endBlock: 0,
  },
  data: [],
});

export const CURATED_MODULE_DEPLOYMENT_BLOCK_NETWORK: {
  [key in CHAINS]?: number;
} = {
  [CHAINS.Mainnet]: 11473216,
  [CHAINS.Holesky]: 0,
};

// will make a gap in case of reorganization
export const SIGNING_KEYS_EVENTS_CACHE_LAG_BLOCKS = 100;
export const SIGNING_KEY_EVENTS_CACHE_UPDATE_BLOCK_RATE = 10;
export const FETCHING_EVENTS_STEP = 100_000;
