import { CHAINS } from '@lido-sdk/constants';

export const GUARDIAN_TOPIC_PREFIX_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: 'mainnet',
  [CHAINS.Goerli]: 'goerli',
};

export const getMessageTopicPrefix = (chainId: CHAINS): string => {
  const address = GUARDIAN_TOPIC_PREFIX_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};

export const GUARDIAN_DEPOSIT_RESIGNING_BLOCKS = 50;
export const GUARDIAN_PAUSE_RESIGNING_BLOCKS = 50;
