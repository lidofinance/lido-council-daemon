import { CHAINS } from '@lido-sdk/constants';
import { DepositEventGroup } from './interfaces';

export const DEPLOYMENT_BLOCK_NETWORK: {
  [key in CHAINS]?: number;
} = {
  [CHAINS.Mainnet]: 11052984,
  [CHAINS.Goerli]: 4367322,
};

export const getDeploymentBlockByNetwork = (chainId: CHAINS): number => {
  const address = DEPLOYMENT_BLOCK_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};

export const DEPOSIT_EVENTS_CACHE_LAG_BLOCKS = 100;
export const DEPOSIT_EVENTS_STEP = 20_000;
export const DEPOSIT_EVENTS_RETRY_TIMEOUT_MS = 5_000;
export const DEPOSIT_EVENTS_CACHE_UPDATE_BLOCK_RATE = 10;

export const DEPOSIT_CACHE_FILE_NAME = 'deposit.events.json';

export const DEPOSIT_CACHE_DEFAULT: DepositEventGroup = Object.freeze({
  version: '-1',
  startBlock: 0,
  endBlock: 0,
  events: [],
});
