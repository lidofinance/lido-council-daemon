import { CHAINS } from '@lido-sdk/constants';

export const DEPLOYMENT_BLOCK_NETWORK: {
  [key in CHAINS]?: number;
} = {
  [CHAINS.Mainnet]: 11052984,
  [CHAINS.Goerli]: 0,
};

export const getDeploymentBlockByNetwork = (chainId: CHAINS): number => {
  return DEPLOYMENT_BLOCK_NETWORK[chainId];
};

export const DEPOSIT_FRESH_EVENTS_AMOUNT = 100;
export const DEPOSIT_EVENTS_STEP = 20_000;
