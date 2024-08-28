import { Test } from '@nestjs/testing';
import { MockProviderModule, ProviderService } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { LevelDBModule, LevelDBService } from './leveldb';
import { mockRepository } from 'contracts/repository/repository.mock';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { cacheMock, newEvent } from './leveldb/leveldb.fixtures';
import { SigningKeyEventsCacheModule } from './signing-key-events-cache.module';
import { SigningKeyEventsCacheService } from './signing-key-events-cache.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

describe('SigningKeyEventsCacheService', () => {
  const defaultCacheValue = {
    headers: {},
    data: [] as any[],
  };

  let dbService: LevelDBService;
  let repositoryService: RepositoryService;
  let locatorService: LocatorService;
  let signingkeyEventsCacheService: SigningKeyEventsCacheService;
  let providerService: ProviderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        RepositoryModule,
        LevelDBModule.register(
          defaultCacheValue,
          'leveldb-spec',
          'signing-keys-spec',
        ),
        LoggerModule,
        SigningKeyEventsCacheModule,
      ],
    }).compile();

    dbService = moduleRef.get(LevelDBService);
    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);
    signingkeyEventsCacheService = moduleRef.get(SigningKeyEventsCacheService);
    providerService = moduleRef.get(ProviderService);

    const loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);

    mockLocator(locatorService);
    await mockRepository(repositoryService);
    await dbService.initialize();
  });

  afterEach(async () => {
    try {
      await dbService.deleteCache();
      await dbService.close();
    } catch (error) {}
  });

  it('should clear cache and update if new module was added', async () => {
    await dbService.insertEventsCacheBatch(cacheMock);
    const result = await dbService.getEventsCache();
    const expected = cacheMock;

    expect(result.headers).toEqual(cacheMock.headers);
    expect(result.data.length).toEqual(expected.data.length);
    expect(result.data).toEqual(expect.arrayContaining(expected.data));

    const endBlock = newEvent.blockNumber + 2000; // (10 - (newEvent.blockNumber % 10));

    jest
      .spyOn(signingkeyEventsCacheService, 'fetchEventsFallOver')
      .mockImplementation(async () => {
        return {
          events: [...cacheMock.data, newEvent],
          stakingModulesAddresses: [
            ...cacheMock.headers.stakingModulesAddresses,
            newEvent.moduleAddress,
          ],
          startBlock: expected.headers.startBlock,
          endBlock,
        };
      });

    jest
      .spyOn(providerService, 'getBlockNumber')
      .mockImplementation(async () => {
        return endBlock;
      });

    jest
      .spyOn(signingkeyEventsCacheService, 'getDeploymentBlockByNetwork')
      .mockImplementation(async () => {
        return expected.headers.startBlock;
      });

    const deleteCache = jest.spyOn(dbService, 'deleteCache');

    await signingkeyEventsCacheService.handleNewBlock(endBlock, [
      ...cacheMock.headers.stakingModulesAddresses,
      newEvent.moduleAddress,
    ]);

    expect(deleteCache).toBeCalledTimes(1);

    const newResult = await dbService.getEventsCache();

    expect(newResult.headers.stakingModulesAddresses).toEqual([
      ...cacheMock.headers.stakingModulesAddresses,
      newEvent.moduleAddress,
    ]);
    expect(newResult.headers.startBlock).toEqual(result.headers.startBlock);
    expect(newResult.headers.endBlock).toEqual(endBlock);
    expect(newResult.data.length).toEqual([...cacheMock.data, newEvent].length);
    expect(newResult.data).toEqual(
      expect.arrayContaining([...cacheMock.data, newEvent]),
    );
  });

  describe('wasStakingModulesListUpdated', () => {
    const testCases = [
      { previousModules: [], currentModules: [], expected: false },
      { previousModules: [], currentModules: ['1'], expected: true },
      { previousModules: ['1'], currentModules: [], expected: true },
      { previousModules: ['1'], currentModules: ['1'], expected: false },
      { previousModules: ['1'], currentModules: ['2'], expected: true },
      {
        previousModules: ['1', '2', '3'],
        currentModules: ['1', '2'],
        expected: true,
      },
      {
        previousModules: ['1', '2'],
        currentModules: ['1', '2', '3'],
        expected: true,
      },
      {
        previousModules: ['1', '2', '3'],
        currentModules: ['2', '3', '4'],
        expected: true,
      },
      {
        previousModules: ['1', '2'],
        currentModules: ['2', '3'],
        expected: true,
      },
      {
        previousModules: ['1', '2', '3'],
        currentModules: ['4', '5', '6'],
        expected: true,
      },
    ];

    testCases.forEach((testCase, index) => {
      it(`Test case ${index + 1}: previousModules = ${JSON.stringify(
        testCase.previousModules,
      )}, currentModules = ${JSON.stringify(
        testCase.currentModules,
      )}, expected = ${testCase.expected}`, () => {
        const result =
          signingkeyEventsCacheService.wasStakingModulesListUpdated(
            testCase.previousModules,
            testCase.currentModules,
          );

        expect(result).toEqual(testCase.expected);
      });
    });
  });
});
