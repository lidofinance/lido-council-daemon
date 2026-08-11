import { CHAINS } from '@lido-nestjs/constants';

const LOCAL_DEVNET_CHAIN_ID = 32382;
const PECTRA_5_DEVNET_CHAIN_ID = 7088110746;
const EPBS_DEVNET_0_CHAIN_ID = 7055777152;

export const MESSAGE_TOPIC_PREFIX_BY_NETWORK = {
  [CHAINS.Mainnet]: 'mainnet',
  [CHAINS.Goerli]: 'goerli',
  [CHAINS.Holesky]: 'holesky',
  [LOCAL_DEVNET_CHAIN_ID]: 'testnet',
  [PECTRA_5_DEVNET_CHAIN_ID]: 'testnet',
  [EPBS_DEVNET_0_CHAIN_ID]: 'testnet',
  [CHAINS.Hoodi]: 'hoodi',
};

export const getMessageTopicPrefix = (chainId: CHAINS): string => {
  const address = MESSAGE_TOPIC_PREFIX_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
