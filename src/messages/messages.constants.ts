import { CHAINS } from '@lido-sdk/constants';

export const MESSAGE_TOPIC_PREFIX_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: 'mainnet',
  [CHAINS.Goerli]: 'goerli',
  [CHAINS.Holesky]: 'holesky',
};

export const getMessageTopicPrefix = (chainId: CHAINS): string => {
  const address = MESSAGE_TOPIC_PREFIX_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
