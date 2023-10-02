import { server } from 'ganache';

export const makeServer = (
  startBlock: number,
  chainId: number,
  unlockedAccounts: string[],
) => {
  const rpcUrl = process.env.RPC_URL;
  const secretKey = process.env.WALLET_PRIVATE_KEY;

  return server({
    logging: {
      verbose: false,
      debug: false,
      quiet: true,
    },
    chainId,
    fork: { url: rpcUrl, blockNumber: startBlock },
    accounts: [{ secretKey, balance: BigInt(1e18) * BigInt(100) }],
    wallet: {
      unlockedAccounts,
    },
  });
};
