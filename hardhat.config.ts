import { HardhatUserConfig } from 'hardhat/config';
import * as dotenv from 'dotenv';
dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RPC_URL = process.env.FORK_URL!;
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const secretKey = process.env.WALLET_PRIVATE_KEY!;
const CHAIN_ID = process.env.CHAIN_ID!;

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      forking: {
        url: RPC_URL,
      },
      chainId: Number(CHAIN_ID),
      accounts: [
        {
          privateKey: secretKey,
          balance: (BigInt(1e18) * BigInt(100)).toString(),
        },
      ],
    },
  },
  solidity: '0.8.4',
};

export default config;
