import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DepositRegistryService } from './deposits-registry.service';
import { DEPOSIT_CACHE_DEFAULT } from './deposits-registry.constants';
import { DepositsRegistryStoreService } from './store/store.service';
import { eventMock1 } from './store/store.fixtures';

describe('DepositRegistryService cache recovery', () => {
  const deploymentBlock = 11052984;
  const firstDepositBlock = deploymentBlock + 2500;
  const finalizedBlock = deploymentBlock + 3000;
  const firstDeposit = {
    ...eventMock1,
    depositCount: 0,
    blockNumber: firstDepositBlock,
  };

  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const metric = {
    labels: () => ({ startTimer: () => () => undefined }),
    set: jest.fn(),
  };
  const provider = {
    getNetwork: async () => ({ chainId: 1 }),
    getBlock: async () => ({ number: finalizedBlock, hash: '0x01' }),
  };

  let cacheDir: string;
  const stores: DepositsRegistryStoreService[] = [];

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'deposits-registry-spec-'));
  });

  afterEach(async () => {
    for (const store of stores.splice(0))
      await store.close().catch(() => undefined);
    await rm(cacheDir, { recursive: true, force: true });
  });

  // One daemon process over the same cache directory.
  const startProcess = () => {
    const store = new DepositsRegistryStoreService(
      logger,
      provider as any,
      metric as any,
      metric as any,
      metric as any,
      cacheDir,
      'deposit-cache',
      DEPOSIT_CACHE_DEFAULT,
    );
    stores.push(store);
    const fetcher = {
      getDeploymentBlockByNetwork: async () => deploymentBlock,
      fetchEventsFallOver: jest.fn(
        async (startBlock: number, endBlock: number) => ({
          startBlock,
          endBlock,
          events: [firstDeposit].filter(
            (event) =>
              event.blockNumber >= startBlock && event.blockNumber <= endBlock,
          ),
        }),
      ),
    };
    const sanityChecker = {
      initialize: jest.fn(),
      verifyCacheBlock: () => true,
      addEventGroupToIndex: jest.fn(),
      verifyUpdatedEvents: async () => true,
    };
    const registry = new DepositRegistryService(
      logger,
      provider as any,
      {} as any,
      sanityChecker as any,
      fetcher as any,
      store,
      'finalized',
    );
    return { store, fetcher, registry };
  };

  it('should resume after a stop in the empty blocks before the first deposit', async () => {
    // The first process stops after two empty chunks, like a startup error
    // elsewhere that calls process.exit while the cache sync runs.
    const first = startProcess();
    first.fetcher.fetchEventsFallOver.mockImplementation(
      async (startBlock: number, endBlock: number) => {
        if (startBlock > deploymentBlock + 2000) {
          throw new Error('process stopped');
        }
        return { startBlock, endBlock, events: [] };
      },
    );
    await expect(first.registry.initialize()).rejects.toThrow(
      'process stopped',
    );
    // The same headers and no events as in the stuck mainnet cache.
    expect(await first.store.getEventsFromDB()).toEqual({
      headers: {
        startBlock: deploymentBlock,
        endBlock: deploymentBlock + 2000,
      },
      data: [],
      lastValidEvent: undefined,
    });
    await first.store.close();

    const restart = startProcess();
    await restart.registry.initialize();

    expect(restart.fetcher.fetchEventsFallOver).toHaveBeenNthCalledWith(
      1,
      deploymentBlock + 1,
      deploymentBlock + 1000,
    );
    expect(restart.store.getEventsCache().headers).toEqual({
      startBlock: deploymentBlock,
      endBlock: finalizedBlock,
    });
    expect(
      restart.store.getEventsCache().data.map((event) => event.depositCount),
    ).toEqual([0]);
  });
});
