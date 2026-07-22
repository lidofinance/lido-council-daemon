import { HardhatUserConfig } from 'hardhat/config';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL;
const secretKey = process.env.WALLET_PRIVATE_KEY;

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      chainId: 560048,
      ...(RPC_URL ? { forking: { url: RPC_URL } } : {}),
      ...(secretKey
        ? {
            accounts: [
              {
                privateKey: secretKey,
                balance: (BigInt(1e18) * BigInt(100)).toString(),
              },
            ],
          }
        : {}),
    },
  },
  solidity: {
    version: '0.8.4',
  },
};

export default config;
