import { WeiPerEther } from '@ethersproject/constants';

export const WALLET_PRIVATE_KEY = 'walletPrivateKey';
// a balance sufficient to perform at least 10 unvetting operations
export const WALLET_MIN_BALANCE = WeiPerEther.div(2);
//  a balance sufficient to pause all connected modules
export const WALLET_CRITICAL_BALANCE = WeiPerEther.div(5);

export const WALLET_BALANCE_UPDATE_BLOCK_RATE = 50;
