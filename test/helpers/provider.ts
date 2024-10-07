// will use this provider two prepare el state for tests

import { JsonRpcProvider } from '@ethersproject/providers';
import { FORK_URL } from './constants';

export const testSetupProvider = new JsonRpcProvider(FORK_URL);

export const accountImpersonate = async (account): Promise<void> => {
  testSetupProvider.send('hardhat_impersonateAccount', [account]);
};
