import { HardhatUserConfig } from 'hardhat/config';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const secretKey =
  process.env.WALLET_PRIVATE_KEY ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const CHAIN_ID = process.env.CHAIN_ID || '17000';

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      forking:
        RPC_URL !== 'http://localhost:8545'
          ? {
              url: RPC_URL,
            }
          : undefined,
      chainId: parseInt(CHAIN_ID, 10),
      accounts: [
        {
          privateKey: secretKey,
          balance: (BigInt(1e18) * BigInt(100)).toString(),
        },
      ],
    },
  },
  solidity: {
    version: '0.8.4',
  },
};

export default config;
