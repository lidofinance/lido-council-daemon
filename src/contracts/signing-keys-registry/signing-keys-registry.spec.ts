import { Test } from '@nestjs/testing';
import { Block } from '@ethersproject/abstract-provider';
import { MockProviderModule, ProviderService } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { SigningKeysStoreService, SigningKeysStoreModule } from './store';
import { mockRepository } from 'contracts/repository/repository.mock';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { cacheMock, newEvent } from './store/store.fixtures';
import { SigningKeysRegistryModule } from './signing-keys-registry.module';
import { SigningKeysRegistryService } from './signing-keys-registry.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SigningKeysRegistryFetcherService } from './fetcher';

describe('SigningKeysRegistryService', () => {
  const defaultCacheValue = {
    headers: {},
    data: [] as any[],
  };

  let dbService: SigningKeysStoreService;
  let repositoryService: RepositoryService;
  let locatorService: LocatorService;
  let signingKeysRegistryService: SigningKeysRegistryService;
  let signingKeysFetch: SigningKeysRegistryFetcherService;
  let providerService: ProviderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        RepositoryModule,
        SigningKeysStoreModule.register(
          defaultCacheValue,
          'leveldb-spec',
          'signing-keys-spec',
        ),
        LoggerModule,
        SigningKeysRegistryModule.register('latest'),
      ],
    }).compile();

    dbService = moduleRef.get(SigningKeysStoreService);
    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);
    signingKeysRegistryService = moduleRef.get(SigningKeysRegistryService);
    signingKeysFetch = moduleRef.get(SigningKeysRegistryFetcherService);
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
      .spyOn(signingKeysFetch, 'fetchEventsFallOver')
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

    jest.spyOn(providerService, 'getBlock').mockImplementation(async () => {
      return { number: endBlock } as Block;
    });

    jest
      .spyOn(signingKeysRegistryService, 'getDeploymentBlockByNetwork')
      .mockImplementation(async () => {
        return expected.headers.startBlock;
      });

    const deleteCache = jest.spyOn(dbService, 'deleteCache');

    await signingKeysRegistryService.handleNewBlock([
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
        const result = signingKeysRegistryService.wasStakingModulesListUpdated(
          testCase.previousModules,
          testCase.currentModules,
        );

        expect(result).toEqual(testCase.expected);
      });
    });
  });
});
