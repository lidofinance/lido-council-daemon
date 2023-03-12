import { CHAINS } from '@lido-sdk/constants';

export const LIDO_LOCATOR_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0x710B3303fB508a84F10793c1106e32bE873C24cd',
  [CHAINS.Goerli]: '0x1eDf09b5023DC86737b59dE68a8130De878984f5',
  [CHAINS.Zhejiang]: '0x548C1ED5C83Bdf19e567F4cd7Dd9AC4097088589',
};

export const getLidoLocatorAddress = (chainId: CHAINS): string => {
  const address = LIDO_LOCATOR_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
