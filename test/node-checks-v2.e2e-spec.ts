// Constants
import { WeiPerEther } from '@ethersproject/constants';
import {
  STAKING_ROUTER,
  CHAIN_ID,
  GANACHE_PORT,
  UNLOCKED_ACCOUNTS_V2,
  FORK_BLOCK_V2,
} from './constants';

// Contract Factories
import { StakingRouterAbi__factory } from '../src/generated';

// App modules and services
import { setupTestingModule } from './helpers/test-setup';
import { WalletService } from 'wallet';
import { ProviderService } from 'provider';
import { Server } from 'ganache';
import { makeServer } from './server';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

describe('ganache e2e tests', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let walletService: WalletService;

  const setupServer = async () => {
    server = makeServer(FORK_BLOCK_V2, CHAIN_ID, UNLOCKED_ACCOUNTS_V2);
    await server.listen(GANACHE_PORT);
  };

  beforeEach(async () => {
    await setupServer();
    const moduleRef = await setupTestingModule();
    providerService = moduleRef.get(ProviderService);
    walletService = moduleRef.get(WalletService);
  }, 20000);

  afterEach(async () => {
    await server.close();
  });

  describe('node checks', () => {
    test('correctness network', async () => {
      const chainId = await providerService.getChainId();
      expect(chainId).toBe(CHAIN_ID);
    });

    test('ability to create new blocks', async () => {
      const isMining = await providerService.provider.send('eth_mining', []);
      expect(isMining).toBe(true);
    });

    test('correctness block number', async () => {
      const provider = providerService.provider;
      const block = await provider.getBlock('latest');
      expect(block.number).toBe(FORK_BLOCK_V2 + 1);
    });

    test('testing address has some eth', async () => {
      const provider = providerService.provider;
      const balance = await provider.getBalance(walletService.address);
      expect(balance.gte(WeiPerEther.mul(34))).toBe(true);
    });

    test('curated module is not on pause', async () => {
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);
    });
  });
});
