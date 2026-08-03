import { Wallet } from 'ethers';

if (process.env.E2E_SILENT_LOGS === undefined) {
  process.env.E2E_SILENT_LOGS = 'true';
}

if (process.env.CHAIN_ID === undefined) {
  process.env.CHAIN_ID = '560048';
}

if (!process.env.KEYS_API_URL) {
  process.env.KEYS_API_URL = 'http://127.0.0.1:3000';
}

if (process.env.WALLET_PRIVATE_KEY === undefined) {
  process.env.WALLET_PRIVATE_KEY = Wallet.createRandom().privateKey;
}
if (process.env.DELEGATE_PRIVATE_KEY === undefined) {
  process.env.DELEGATE_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
}

if (process.env.DELEGATION_CONTRACT_ADDRESS === undefined) {
  process.env.DELEGATION_CONTRACT_ADDRESS =
    '0x0000000000000000000000000000000000000001';
}
