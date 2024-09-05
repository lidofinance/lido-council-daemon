import { CHAINS } from '@lido-sdk/constants';

export const DEPLOYMENT_BLOCK_NETWORK: {
  [key in CHAINS]?: number;
} = {
  [CHAINS.Mainnet]: 11052984,
  [CHAINS.Goerli]: 4367322,
  [CHAINS.Holesky]: 0,
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
