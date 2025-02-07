import { CHAINS } from '@lido-sdk/constants';

export const SIGNING_KEYS_CACHE_DEFAULT = Object.freeze({
  headers: {
    stakingModulesAddresses: [],
    startBlock: 0,
    endBlock: 0,
  },
  data: [],
});

const LOCAL_DEVNET_CHAIN_ID = 32382;
const PECTRA_5_DEVNET_CHAIN_ID = 7088110746;
const PECTRA_6_DEVNET_CHAIN_ID = 7072151312;

export const EARLIEST_MODULE_DEPLOYMENT_BLOCK_NETWORK = {
  [CHAINS.Mainnet]: 11473216,
  [CHAINS.Holesky]: 0,
  [LOCAL_DEVNET_CHAIN_ID]: 0,
  [PECTRA_5_DEVNET_CHAIN_ID]: 0,
  [PECTRA_6_DEVNET_CHAIN_ID]: 0,
};

// will make a gap in case of reorganization
export const SIGNING_KEYS_EVENTS_CACHE_LAG_BLOCKS = 100;
export const FETCHING_EVENTS_STEP = 10_000;
export const SIGNING_KEYS_REGISTRY_FINALIZED_TAG = 'finalized';
