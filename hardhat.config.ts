import { HardhatUserConfig } from 'hardhat/config';
import * as dotenv from 'dotenv';
dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RPC_URL = process.env.RPC_URL!;

if (!RPC_URL) {
  console.log('rpc URL is not set');
}

if (process.env.CHAIN_ID !== '17000') {
  console.log('smth wrong with chain id', process.env.CHAIN_ID);
}
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const secretKey = process.env.WALLET_PRIVATE_KEY!;
const CHAIN_ID = process.env.CHAIN_ID || '17000';

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      forking: {
        url: RPC_URL,
      },
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
