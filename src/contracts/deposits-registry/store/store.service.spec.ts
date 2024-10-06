import { Test } from '@nestjs/testing';
import { MockProviderModule } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { DepositsRegistryStoreModule } from './store.module';
import { DepositsRegistryStoreService } from './store.service';
import { cacheMock, eventMock1 } from './store.fixtures';
import { PrometheusModule } from 'common/prometheus';

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
