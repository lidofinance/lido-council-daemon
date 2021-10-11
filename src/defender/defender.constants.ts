import { CHAINS } from '@lido-sdk/constants';

export const DEFENDER_TOPIC_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: 'mainnet-defender',
  [CHAINS.Goerli]: 'goerli-defender',
};

export const getMessageTopic = (chainId: CHAINS): string => {
  return DEFENDER_TOPIC_BY_NETWORK[chainId];
};
