import { HardhatUserConfig } from 'hardhat/config';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const secretKey = process.env.WALLET_PRIVATE_KEY!;

console.log(`Using RPC URL: ${RPC_URL.split('.')[0]}`);

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      forking: {
        url: RPC_URL,
      },
      chainId: 560048,
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
