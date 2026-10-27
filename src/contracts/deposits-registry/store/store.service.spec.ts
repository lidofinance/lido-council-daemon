import { Test } from '@nestjs/testing';
import { MockProviderModule } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { DepositsRegistryStoreModule } from './store.module';
import { DepositsRegistryStoreService } from './store.service';
import { cacheMock, eventMock1 } from './store.fixtures';
import { PrometheusModule } from 'common/prometheus';
import { DEPOSIT_CACHE_DEFAULT } from '../deposits-registry.constants';

const getEventsDepositCount = async (
  dbService: DepositsRegistryStoreService,
) => {
  const resultCache = dbService.getEventsCache();
  const resultDB = await dbService.getEventsFromDB();

  expect(resultCache).toEqual(resultDB);
  const expectedDeposits = resultCache.data.map((event) => event.depositCount);
  return expectedDeposits;
};

describe('dbService', () => {
  const defaultCacheValue = {
    headers: {},
    data: [] as any[],
  };

  let dbService: DepositsRegistryStoreService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PrometheusModule,
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        DepositsRegistryStoreModule.register(defaultCacheValue, 'leveldb-spec'),
        LoggerModule,
      ],
    }).compile();

    dbService = moduleRef.get(DepositsRegistryStoreService);

    await dbService.initialize();
  });

  afterEach(async () => {
    try {
      await dbService.deleteCache();
      await dbService.close();
    } catch (error) {}
  });

  it('should return default cache', async () => {
    const result = dbService.getEventsCache();
    expect(result).toEqual(defaultCacheValue);
  });

  it('should return saved cache', async () => {
    const expected = cacheMock;

    await dbService.insertEventsCacheBatch(expected);

    const resultCache = await dbService.getEventsCache();
    const resultDB = await dbService.getEventsFromDB();

    expect(resultCache).toEqual(resultDB);
    expect(resultCache).toEqual(expected);
  });

  describe('cache metrics accounting', () => {
    it('should not change cache counters when storing only the last valid event', async () => {
      expect((dbService as any).cacheEventCount).toBe(0);
      expect((dbService as any).cacheSizeBytes).toBe(0);

      await dbService.insertLastValidEvent(eventMock1);

      expect((dbService as any).cacheEventCount).toBe(0);
      expect((dbService as any).cacheSizeBytes).toBe(0);

      const result = await dbService.getEventsFromDB();
      expect(result.data).toEqual([]);
      expect(result.lastValidEvent).toEqual(eventMock1);
      expect((dbService as any).cacheEventCount).toBe(0);
      expect((dbService as any).cacheSizeBytes).toBe(0);
    });

    it('should track cache counters only for deposit entries', async () => {
      const expectedCount = cacheMock.data.length;
      const expectedBytes = cacheMock.data.reduce(
        (sum, event) =>
          sum +
          Buffer.byteLength(
            dbService.serializeDepositEvent(event, false),
            'utf8',
          ),
        0,
      );

      await dbService.insertEventsCacheBatch(cacheMock);

      expect((dbService as any).cacheEventCount).toBe(expectedCount);
      expect((dbService as any).cacheSizeBytes).toBe(expectedBytes);
    });

    it('should exclude last-valid-event from cache counters after inserting deposits', async () => {
      const expectedCount = cacheMock.data.length;
      const expectedBytes = cacheMock.data.reduce(
        (sum, event) =>
          sum +
          Buffer.byteLength(
            dbService.serializeDepositEvent(event, false),
            'utf8',
          ),
        0,
      );

      await dbService.insertLastValidEvent({
        ...eventMock1,
        depositCount: 999,
      });
      await dbService.insertEventsCacheBatch(cacheMock);

      expect((dbService as any).cacheEventCount).toBe(expectedCount);
      expect((dbService as any).cacheSizeBytes).toBe(expectedBytes);
    });
  });

  describe('validateAndCleanInconsistentCache', () => {
    const testCases = [
      {
        deposits: [0, 1, 3, 4],
        expectedRemaining: [0, 1],
      },
      {
        deposits: [0, 1, 2, 3],
        expectedRemaining: [0, 1, 2, 3],
      },
      {
        deposits: [0, 1, 1, 2, 3],
        expectedRemaining: [0, 1],
      },
      {
        deposits: [0, 1, 0],
        expectedRemaining: [0, 1],
      },
      {
        deposits: [1, 2, 3],
        expectedRemaining: [],
      },
      {
        deposits: [],
        expectedRemaining: [],
      },
    ];

    it.each(testCases)('%s', async ({ deposits, expectedRemaining }) => {
      // Insert mock data into the cache
      await dbService.insertEventsCacheBatch({
        headers: { startBlock: 1, endBlock: 100 },
        data: deposits.map((depositCount) => ({ ...eventMock1, depositCount })),
      });

      // Validate and clean cache
      await dbService.validateAndCleanInconsistentCache();

      // Retrieve remaining deposits and check consistency
      const actualRemaining = await getEventsDepositCount(dbService);
      expect(actualRemaining).toEqual(expectedRemaining);
      expect(actualRemaining.length).toBe(expectedRemaining.length);
    });
  });

  describe('deleteDepositsGreaterThanOrEqualNBatch', () => {
    const testCases = [
      { N: 10, deposits: [9, 10, 11, 12], expectedRemaining: [9] },
      { N: 5, deposits: [3, 4, 5, 6], expectedRemaining: [3, 4] },
      { N: 0, deposits: [0, 1, 2], expectedRemaining: [] },
      { N: 2, deposits: [0, 1], expectedRemaining: [0, 1] },
      { N: 102, deposits: [0, 1], expectedRemaining: [0, 1] },
    ];

    it.each(testCases)(
      'should delete deposits where deposit count is greater than %s',
      async ({ N, deposits, expectedRemaining }) => {
        await dbService.insertEventsCacheBatch({
          headers: { startBlock: 1, endBlock: 100 },
          data: deposits.map((count) => ({
            ...eventMock1,
            depositCount: count,
          })),
        });

        const insertedDeposits = await getEventsDepositCount(dbService);
        expect(insertedDeposits).toEqual(expect.arrayContaining(deposits));
        expect(insertedDeposits.length).toBe(deposits.length);

        await dbService.deleteDepositsGreaterThanOrEqualNBatch(N, {
          endBlock: 0,
          startBlock: 0,
        });

        const expectedDeposits = await getEventsDepositCount(dbService);
        expect(expectedDeposits).toEqual(
          expect.arrayContaining(expectedRemaining),
        );
        expect(expectedDeposits.length).toBe(expectedRemaining.length);
      },
    );
  });

  describe('clearFromLastValidEvent', () => {
    const testCases = [
      { lastValidCount: 5, deposits: [4, 5, 6], expectedRemaining: [4, 5] },
      { lastValidCount: 1, deposits: [1, 2, 3], expectedRemaining: [1] },
      { lastValidCount: 0, deposits: [0, 1], expectedRemaining: [0] },
    ];

    it.each(testCases)(
      'should clear deposits starting from depositCount %s',
      async ({ lastValidCount, deposits, expectedRemaining }) => {
        await dbService.insertLastValidEvent({
          ...eventMock1,
          depositCount: lastValidCount,
        });

        const lastEvent = await dbService.getLastValidEvent();
        expect(lastEvent).toBeDefined();
        expect(lastEvent?.depositCount).toBe(lastValidCount);

        await dbService.insertEventsCacheBatch({
          headers: { startBlock: 1, endBlock: 100 },
          data: deposits.map((count) => ({
            ...eventMock1,
            depositCount: count,
          })),
        });

        const insertedDeposits = await getEventsDepositCount(dbService);
        expect(insertedDeposits).toEqual(expect.arrayContaining(deposits));
        expect(insertedDeposits.length).toBe(deposits.length);

        await dbService.clearFromLastValidEvent();

        const expectedDeposits = await getEventsDepositCount(dbService);
        expect(expectedDeposits).toEqual(
          expect.arrayContaining(expectedRemaining),
        );
        expect(expectedDeposits.length).toBe(expectedRemaining.length);
      },
    );
  });
});

// The suite above registers a default without endBlock, so the header check
// compares undefined with startBlock and never fails. Production uses
// DEPOSIT_CACHE_DEFAULT with both bounds at 0.
describe('dbService with the production default headers', () => {
  const deploymentBlock = 11052984;
  // State found in a stuck mainnet cache: two empty 1000-block chunks after
  // the deposit contract deployment and no events.
  const emptyChunksHeaders = {
    startBlock: deploymentBlock,
    endBlock: deploymentBlock + 2000,
  };

  let dbService: DepositsRegistryStoreService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PrometheusModule,
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        DepositsRegistryStoreModule.register(
          DEPOSIT_CACHE_DEFAULT,
          'leveldb-spec',
          'deposit-cache-default',
        ),
        LoggerModule,
      ],
    }).compile();

    dbService = moduleRef.get(DepositsRegistryStoreService);

    await dbService.initialize();
  });

  afterEach(async () => {
    try {
      await dbService.deleteCache();
      await dbService.close();
    } catch (error) {}
  });

  it.each([{ deposits: [] as number[] }, { deposits: [1, 2] }])(
    'should reset both header bounds on restart without a valid event, %s',
    async ({ deposits }) => {
      await dbService.insertEventsCacheBatch({
        headers: emptyChunksHeaders,
        data: deposits.map((depositCount) => ({ ...eventMock1, depositCount })),
      });
      await dbService.close();

      await dbService.initialize();

      expect(await getEventsDepositCount(dbService)).toEqual([]);
      expect(dbService.getEventsCache().headers).toEqual(
        DEPOSIT_CACHE_DEFAULT.headers,
      );
    },
  );

  it('should keep the end block at the last valid event on restart', async () => {
    await dbService.insertEventsCacheBatch({
      headers: emptyChunksHeaders,
      data: [0, 1, 3].map((depositCount) => ({
        ...eventMock1,
        depositCount,
        blockNumber: deploymentBlock + 100 + depositCount,
      })),
    });
    await dbService.close();

    await dbService.initialize();

    expect(await getEventsDepositCount(dbService)).toEqual([0, 1]);
    expect(dbService.getEventsCache().headers).toEqual({
      startBlock: deploymentBlock,
      endBlock: deploymentBlock + 101,
    });
  });

  it('should reset both header bounds when clearing without a last valid event', async () => {
    await dbService.insertEventsCacheBatch({
      headers: emptyChunksHeaders,
      data: [],
    });

    await dbService.clearFromLastValidEvent();

    expect(dbService.getEventsCache().headers).toEqual(
      DEPOSIT_CACHE_DEFAULT.headers,
    );
  });
});
