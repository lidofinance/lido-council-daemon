import { CHAINS } from '@lido-sdk/constants';

export const LIDO_LOCATOR_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb',
  [CHAINS.Goerli]: '0x1eDf09b5023DC86737b59dE68a8130De878984f5',
  [CHAINS.Holesky]: '0x28FAB2059C713A7F9D8c86Db49f9bb0e96Af1ef8',
  [CHAINS.Hoodi]: '0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8',
};

export { CHAINS };
