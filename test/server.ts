import { server } from 'ganache';

export const makeServer = (
  startBlock: number,
  chainId: number,
  unlockedAccounts: string[],
  forkDisabled?: boolean,
) => {
  const rpcUrl = process.env.RPC_URL;
  const secretKey = process.env.WALLET_PRIVATE_KEY;

  let opts = {
    logging: {
      verbose: false,
      debug: false,
      quiet: true,
    },
    chain: {
      chainId,
    },
    wallet: {
      unlockedAccounts,
      accounts: [{ secretKey, balance: BigInt(1e18) * BigInt(100) }],
    },
  } as any;

  if (!forkDisabled) {
    opts = {
      ...opts,
      fork: { url: rpcUrl, blockNumber: startBlock },
    };
  }

  return server(opts);
};
