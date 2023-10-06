import { CHAINS } from '@lido-sdk/constants';

export const DEPLOYMENT_BLOCK_NETWORK: {
  [key in CHAINS]?: number;
} = {
  [CHAINS.Mainnet]: 11052984,
  [CHAINS.Goerli]: 4367322,
  [CHAINS.Holesky]: 0,
};

export const getDeploymentBlockByNetwork = (chainId: CHAINS): number => {
  const address = DEPLOYMENT_BLOCK_NETWORK[chainId];
  if (address == null) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};

export const DEPOSIT_EVENTS_CACHE_LAG_BLOCKS = 100;
export const DEPOSIT_EVENTS_STEP = 10_000;
export const DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE = 10;

export const DEPOSIT_CACHE_FILE_NAME = 'deposit.events.json';
export const DEPOSIT_CACHE_BATCH_SIZE = 100_000;

export const DEPOSIT_CACHE_DEFAULT = Object.freeze({
  headers: {
    version: '-1',
    startBlock: 0,
    endBlock: 0,
  },
  data: [],
});
