import { CHAINS } from '@lido-nestjs/constants';

const LOCAL_DEVNET_CHAIN_ID = 32382;

export const MESSAGE_TOPIC_PREFIX_BY_NETWORK = {
  [CHAINS.Mainnet]: 'mainnet',
  [CHAINS.Goerli]: 'goerli',
  [CHAINS.Holesky]: 'holesky',
  [CHAINS.Hoodi]: 'hoodi',
  [LOCAL_DEVNET_CHAIN_ID]: 'testnet',
};

export const getMessageTopicPrefix = (chainId: CHAINS): string => {
  const address = MESSAGE_TOPIC_PREFIX_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
