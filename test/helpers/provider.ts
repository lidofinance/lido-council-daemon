// will use this provider two prepare el state for tests

import { JsonRpcProvider } from '@ethersproject/providers';
import { ethers } from 'ethers';
import { FORK_URL } from './constants';

export const testSetupProvider = new JsonRpcProvider(FORK_URL);

export const accountImpersonate = async (account): Promise<void> => {
  testSetupProvider.send('hardhat_impersonateAccount', [account]);
};

export const setBalance = async (account: string, eth: number) => {
  const amountInWei = ethers.utils.parseEther(eth.toString());

  await testSetupProvider.send('hardhat_setBalance', [
    account,
    ethers.utils.hexlify(amountInWei),
  ]);
};

export async function getChainId() {
  const network = await testSetupProvider.getNetwork();
  return network.chainId;
}
