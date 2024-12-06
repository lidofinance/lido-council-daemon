import { JsonRpcProvider } from '@ethersproject/providers';
import { ethers } from 'ethers';
import { TEST_SERVER_URL } from '../constants';

export const testSetupProvider = new JsonRpcProvider(TEST_SERVER_URL);

export const accountImpersonate = async (account: string): Promise<void> => {
  testSetupProvider.send('hardhat_impersonateAccount', [account]);
};

export const setBalance = async (account: string, eth: number) => {
  const amountInWei = ethers.utils.parseEther(eth.toString());

  await testSetupProvider.send('hardhat_setBalance', [
    account,
    ethers.utils.hexlify(amountInWei),
  ]);
};

export const getChainId = async () => {
  const network = await testSetupProvider.getNetwork();
  return network.chainId;
};
