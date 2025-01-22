import { CHAINS } from '@lido-sdk/constants';

const LOCAL_DEVNET_CHAIN_ID = 32382;
const PECTRA_5_DEVNET_CHAIN_ID = 7088110746;

export const MESSAGE_TOPIC_PREFIX_BY_NETWORK = {
  [CHAINS.Mainnet]: 'mainnet',
  [CHAINS.Goerli]: 'goerli',
  [CHAINS.Holesky]: 'holesky',
  [LOCAL_DEVNET_CHAIN_ID]: 'devnet',
  [PECTRA_5_DEVNET_CHAIN_ID]: 'devnet-pectra5',
};

export const getMessageTopicPrefix = (chainId: CHAINS): string => {
  const address = MESSAGE_TOPIC_PREFIX_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
