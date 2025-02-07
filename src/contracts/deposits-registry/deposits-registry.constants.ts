import { CHAINS } from '@lido-sdk/constants';

const LOCAL_DEVNET_CHAIN_ID = 32382;
const PECTRA_5_DEVNET_CHAIN_ID = 7088110746;
const PECTRA_6_DEVNET_CHAIN_ID = 7072151312;

export const DEPLOYMENT_BLOCK_NETWORK = {
  [CHAINS.Mainnet]: 11052984,
  [CHAINS.Goerli]: 4367322,
  [CHAINS.Holesky]: 0,
  [LOCAL_DEVNET_CHAIN_ID]: 0,
  [PECTRA_5_DEVNET_CHAIN_ID]: 0,
  [PECTRA_6_DEVNET_CHAIN_ID]: 0,
};

export const DEPOSIT_EVENTS_STEP = 10_000;

export const DEPOSIT_CACHE_DEFAULT = Object.freeze({
  headers: {
    startBlock: 0,
    endBlock: 0,
  },
  data: [],
});

export const DEPOSIT_REGISTRY_FINALIZED_TAG = Symbol.for(
  'DEPOSIT_REGISTRY_FINALIZED_TAG',
);
