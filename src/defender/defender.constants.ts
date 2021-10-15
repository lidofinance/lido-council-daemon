import { CHAINS } from '@lido-sdk/constants';

export const DEFENDER_TOPIC_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: 'mainnet-defender',
  [CHAINS.Goerli]: 'goerli-defender',
};

export const getMessageTopic = (chainId: CHAINS): string => {
  const address = DEFENDER_TOPIC_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};

export const DEFENDER_DEPOSIT_RESIGNING_BLOCKS = 50;
export const DEFENDER_PAUSE_RESIGNING_BLOCKS = 50;
