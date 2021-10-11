import { CHAINS } from '@lido-sdk/constants';

export const DEPLOYMENT_BLOCK_NETWORK: {
  [key in CHAINS]?: number;
} = {
  [CHAINS.Mainnet]: 11052984,
  [CHAINS.Goerli]: 4367322,
};

export const getDeploymentBlockByNetwork = (chainId: CHAINS): number => {
  return DEPLOYMENT_BLOCK_NETWORK[chainId];
};

export const DEPOSIT_EVENTS_FRESH_NUMBER = 100;
export const DEPOSIT_EVENTS_STEP = 20_000;
export const DEPOSIT_EVENTS_RETRY_TIMEOUT_MS = 2_000;
export const DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE = 10;
