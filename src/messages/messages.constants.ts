import { CHAINS } from '@lido-sdk/constants';

const LOCAL_DEVNET_CHAIN_ID = 32382;
const PECTRA_5_DEVNET_CHAIN_ID = 7088110746;
const PECTRA_6_DEVNET_CHAIN_ID = 7072151312;
const PECTRA_7_DEVNET_CHAIN_ID = 7032118028;

export const MESSAGE_TOPIC_PREFIX_BY_NETWORK = {
  [CHAINS.Mainnet]: 'mainnet',
  [CHAINS.Goerli]: 'goerli',
  [CHAINS.Holesky]: 'holesky',
  [LOCAL_DEVNET_CHAIN_ID]: 'testnet',
  [PECTRA_5_DEVNET_CHAIN_ID]: 'testnet',
  [PECTRA_6_DEVNET_CHAIN_ID]: 'testnet',
  [PECTRA_7_DEVNET_CHAIN_ID]: 'testnet',
};

export const getMessageTopicPrefix = (chainId: CHAINS): string => {
  const address = MESSAGE_TOPIC_PREFIX_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
