jest.mock('utils/sleep');

import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Interface } from '@ethersproject/abi';
import { LoggerService } from '@nestjs/common';
import { getNetwork } from '@ethersproject/networks';
import { sleep } from 'utils';
import { LevelDBService } from './leveldb';
import {
  ERRORS_LIMIT_EXCEEDED,
  MockProviderModule,
  ProviderService,
} from 'provider';
import { DepositAbi__factory } from 'generated';
import { RepositoryModule, RepositoryService } from 'contracts/repository';

import { DepositModule } from './deposit.module';
import { DepositService } from './deposit.service';
import { PrometheusModule } from 'common/prometheus';
import { LoggerModule } from 'common/logger';
import { ConfigModule } from 'common/config';
import { BlsService } from 'bls';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { mockRepository } from 'contracts/repository/repository.mock';
import { DepositTree } from './deposit-tree';

const mockSleep = sleep as jest.MockedFunction<typeof sleep>;

describe('DepositService', () => {
  let providerService: ProviderService;
  let cacheService: LevelDBService;
  let depositService: DepositService;
  let loggerService: LoggerService;
  let repositoryService: RepositoryService;
  let blsService: BlsService;
  let locatorService: LocatorService;

  const depositAddress = '0x' + '1'.repeat(40);

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        DepositModule,
        PrometheusModule,
        LoggerModule,
        RepositoryModule,
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    cacheService = moduleRef.get(LevelDBService);
    depositService = moduleRef.get(DepositService);
    repositoryService = moduleRef.get(RepositoryService);
    blsService = moduleRef.get(BlsService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    locatorService = moduleRef.get(LocatorService);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);

    mockLocator(locatorService);
    await mockRepository(repositoryService);

    jest
      .spyOn(repositoryService, 'getDepositAddress')
      .mockImplementation(async () => depositAddress);
  });

  describe('getDeploymentBlockByNetwork', () => {
    it('should return block number for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const blockNumber = await depositService.getDeploymentBlockByNetwork();
      expect(typeof blockNumber).toBe('number');
      expect(blockNumber).toBeGreaterThan(0);
    });

    it('should return block number for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const blockNumber = await depositService.getDeploymentBlockByNetwork();
      expect(typeof blockNumber).toBe('number');
      expect(blockNumber).toBeGreaterThan(0);
    });
  });

  describe('deposit cache', () => {
    beforeEach(async () => {
      await cacheService.initialize();
    });

    afterEach(async () => {
      await cacheService.deleteCache();
      await cacheService.close();
    });
    describe('getCachedEvents', () => {
      const deploymentBlock = 100;

      beforeEach(async () => {
        jest
          .spyOn(depositService, 'getDeploymentBlockByNetwork')
          .mockImplementation(async () => deploymentBlock);
      });

      it('should return events from cache', async () => {
        const cache = {
          data: [{} as any],
          headers: {
            startBlock: deploymentBlock,
            endBlock: deploymentBlock + 100,
          },
        };

        const mockCache = jest
          .spyOn(cacheService, 'getEventsCache')
          .mockImplementation(async () => cache);

        const result = await depositService.getCachedEvents();

        expect(mockCache).toBeCalledTimes(1);
        expect(result).toEqual(cache);
      });

      it('should return deploymentBlock if cache is empty', async () => {
        const cache = {
          data: [{} as any],
          headers: {
            startBlock: 0,
            endBlock: 0,
          },
        };

        const mockCache = jest
          .spyOn(cacheService, 'getEventsCache')
          .mockImplementation(async () => cache);

        const result = await depositService.getCachedEvents();

        expect(mockCache).toBeCalledTimes(1);
        expect(result.headers.startBlock).toBe(deploymentBlock);
        expect(result.headers.endBlock).toBe(deploymentBlock);
      });
    });

    describe('setCachedEvents', () => {
      it('should call setCache from the cacheService', async () => {
        const eventGroup = {} as any;

        const mockSetCache = jest
          .spyOn(cacheService, 'insertEventsCacheBatch')
          .mockImplementation(async () => undefined);

        await depositService.setCachedEvents(eventGroup);

        expect(mockSetCache).toBeCalledTimes(1);
        expect(mockSetCache).toBeCalledWith({ headers: {} });
      });
    });

    describe('fetchEventsFallOver', () => {
      it('should fetch events', async () => {
        const expected = {
          endBlock: 0,
          events: [],
          startBlock: 10,
        };

        const from = 0;
        const to = 10;

        const mockFetchEvents = jest
          .spyOn(depositService, 'fetchEvents')
          .mockImplementation(async () => expected);

        const result = await depositService.fetchEventsFallOver(from, to);

        expect(mockFetchEvents).toBeCalledTimes(1);
        expect(mockFetchEvents).toBeCalledWith(from, to);
        expect(result).toEqual(expected);
      });

      it('should fetch recursive if limit exceeded', async () => {
        const event1 = {} as any;
        const event2 = {} as any;
        const expectedFirst = { events: [event1], startBlock: 0, endBlock: 4 };
        const expectedSecond = {
          events: [event2],
          startBlock: 5,
          endBlock: 10,
        };

        const startBlock = 0;
        const endBlock = 10;

        const mockFetchEvents = jest
          .spyOn(depositService, 'fetchEvents')
          .mockImplementationOnce(async () => {
            throw { error: { code: ERRORS_LIMIT_EXCEEDED[0] } };
          })
          .mockImplementationOnce(async () => expectedFirst)
          .mockImplementationOnce(async () => expectedSecond);

        const result = await depositService.fetchEventsFallOver(
          startBlock,
          endBlock,
        );

        const { calls, results } = mockFetchEvents.mock;
        const events = [event1, event2];

        expect(result).toEqual({ events, startBlock, endBlock });
        expect(mockFetchEvents).toBeCalledTimes(3);
        expect(calls[0]).toEqual([startBlock, endBlock]);
        expect(calls[1]).toEqual([
          expectedFirst.startBlock,
          expectedFirst.endBlock,
        ]);
        expect(calls[2]).toEqual([
          expectedSecond.startBlock,
          expectedSecond.endBlock,
        ]);
        await expect(results[1].value).resolves.toEqual(expectedFirst);
        await expect(results[2].value).resolves.toEqual(expectedSecond);
      });

      it('should retry if error is unknown', async () => {
        const events = [];
        const startBlock = 0;
        const endBlock = 10;
        const expected = { events, startBlock, endBlock };

        mockSleep.mockImplementationOnce(async () => undefined);

        const mockFetchEvents = jest
          .spyOn(depositService, 'fetchEvents')
          .mockImplementationOnce(async () => {
            throw new Error();
          })
          .mockImplementationOnce(async () => expected);

        const result = await depositService.fetchEventsFallOver(
          startBlock,
          endBlock,
        );

        const { calls, results } = mockFetchEvents.mock;

        expect(result).toEqual(expected);
        expect(mockFetchEvents).toBeCalledTimes(2);
        expect(calls[0]).toEqual([startBlock, endBlock]);
        expect(calls[1]).toEqual([startBlock, endBlock]);
        await expect(results[0].value).rejects.toThrow();
        await expect(results[1].value).resolves.toEqual(expected);

        expect(mockSleep).toBeCalledTimes(1);
        expect(mockSleep).toBeCalledWith(expect.any(Number));
      });
    });

    describe('fetchEvents', () => {
      it('should fetch events', async () => {
        const freshPubkeys = ['0x4321', '0x8765'];
        const startBlock = 100;
        const endBlock = 200;

        jest
          .spyOn(providerService.provider, 'getBlockNumber')
          .mockImplementation(async () => endBlock);

        jest.spyOn(blsService, 'verify').mockImplementation(() => true);

        const mockProviderCall = jest
          .spyOn(providerService.provider, 'getLogs')
          .mockImplementation(async () => {
            const iface = new Interface(DepositAbi__factory.abi);
            const eventFragment = iface.getEvent('DepositEvent');

            return freshPubkeys.map((pubkey) => {
              const args = [pubkey, '0x', '0x', '0x', 1];
              return iface.encodeEventLog(eventFragment, args) as any;
            });
          });

        const result = await depositService.fetchEvents(startBlock, endBlock);
        expect(result).toEqual(
          expect.objectContaining({
            startBlock,
            endBlock,
            events: freshPubkeys.map((pubkey) =>
              expect.objectContaining({ pubkey }),
            ),
          }),
        );
        expect(mockProviderCall).toBeCalledTimes(1);
      });
    });

    describe('updateEventsCache', () => {
      const cachedPubkeys = ['0x1234', '0x5678'];
      const cache = {
        headers: {
          startBlock: 0,
          endBlock: 2,
        },
        data: cachedPubkeys.map((pubkey) => ({ pubkey } as any)),
      };
      const currentBlock = 1000;
      const firstNotCachedBlock = cache.headers.endBlock + 1;

      beforeEach(async () => {
        jest
          .spyOn(depositService, 'getCachedEvents')
          .mockImplementation(async () => ({ ...cache }));

        jest
          .spyOn(providerService, 'getBlockNumber')
          .mockImplementation(async () => currentBlock);
      });

      it('should collect events', async () => {
        const mockFetchEventsFallOver = jest
          .spyOn(depositService, 'fetchEventsFallOver')
          .mockImplementation(async (startBlock, endBlock) => ({
            startBlock,
            endBlock,
            events: [],
          }));

        jest
          .spyOn(depositService, 'setCachedEvents')
          .mockImplementation(async () => undefined);

        await depositService.updateEventsCache();

        expect(mockFetchEventsFallOver).toBeCalledTimes(1);
        const { calls: fetchCalls } = mockFetchEventsFallOver.mock;
        expect(fetchCalls[0][0]).toBe(firstNotCachedBlock);
        expect(fetchCalls[0][1]).toBeLessThan(currentBlock);
      });

      it('should save events to the cache', async () => {
        jest
          .spyOn(depositService, 'fetchEventsFallOver')
          .mockImplementation(async (startBlock, endBlock) => ({
            startBlock,
            endBlock,
            events: [],
          }));

        const mockSetCachedEvents = jest
          .spyOn(cacheService, 'insertEventsCacheBatch')
          .mockImplementation(async () => undefined);

        await depositService.updateEventsCache();

        expect(mockSetCachedEvents).toBeCalledTimes(1);
        const { calls: cacheCalls } = mockSetCachedEvents.mock;
        expect(cacheCalls[0][0].headers.startBlock).toBe(
          cache.headers.startBlock,
        );
        expect(cacheCalls[0][0].headers.endBlock).toBeLessThan(currentBlock);
      });
    });

    describe('getAllDepositedEvents', () => {
      const cachedPubkeys = ['0x1234', '0x5678'];
      const freshPubkeys = ['0x4321', '0x8765'];
      const cachedEvents = {
        headers: {
          startBlock: 0,
          endBlock: 2,
        },
        data: cachedPubkeys.map((pubkey) => ({ pubkey } as any)),
      };
      const currentBlock = 10;
      const currentBlockHash = '0x12';
      const firstNotCachedBlock = cachedEvents.headers.endBlock + 1;

      beforeEach(async () => {
        jest
          .spyOn(depositService, 'getCachedEvents')
          .mockImplementation(async () => ({ ...cachedEvents }));

        jest
          .spyOn(providerService, 'getBlockNumber')
          .mockImplementation(async () => currentBlock);
      });

      it('should return cached events', async () => {
        const tree = new DepositTree();

        jest
          .spyOn(providerService.provider, 'call')
          .mockImplementation(async () => {
            const iface = new Interface(DepositAbi__factory.abi);
            return iface.encodeFunctionResult('get_deposit_root', [
              tree.getRoot(),
            ]);
          });
        const mockFetchEventsFallOver = jest
          .spyOn(depositService, 'fetchEventsFallOver')
          .mockImplementation(async () => ({
            startBlock: firstNotCachedBlock,
            endBlock: currentBlock,
            events: [],
          }));

        const result = await depositService.getAllDepositedEvents(
          currentBlock,
          currentBlockHash,
        );
        expect(result).toEqual({
          events: cachedEvents.data,
          startBlock: cachedEvents.headers.startBlock,
          endBlock: currentBlock,
        });

        expect(mockFetchEventsFallOver).toBeCalledTimes(1);
        expect(mockFetchEventsFallOver).toBeCalledWith(
          firstNotCachedBlock,
          currentBlock,
        );
      });

      it('should return merged pub keys', async () => {
        const depositDataRoot = new Uint8Array([
          185, 198, 196, 67, 108, 68, 92, 238, 17, 164, 72, 110, 30, 168, 28,
          57, 33, 93, 199, 57, 212, 165, 179, 74, 247, 55, 220, 97, 138, 135,
          59, 101,
        ]);

        const events = freshPubkeys.map((pubkey) => ({
          pubkey,
          depositDataRoot,
        }));

        const mockFetchEventsFallOver = jest
          .spyOn(depositService, 'fetchEventsFallOver')
          .mockImplementation(async () => ({
            startBlock: firstNotCachedBlock,
            endBlock: currentBlock,
            events: events as any,
          }));

        const tree = new DepositTree();
        events.map(({ depositDataRoot }) => {
          tree.insertNode(depositDataRoot);
        });

        jest
          .spyOn(providerService.provider, 'call')
          .mockImplementation(async () => {
            const iface = new Interface(DepositAbi__factory.abi);
            return iface.encodeFunctionResult('get_deposit_root', [
              tree.getRoot(),
            ]);
          });

        const result = await depositService.getAllDepositedEvents(
          currentBlock,
          currentBlockHash,
        );

        expect(result).toEqual({
          startBlock: cachedEvents.headers.startBlock,
          endBlock: currentBlock,
          events: cachedPubkeys
            .map((pubkey) => ({ pubkey } as any))
            .concat(
              freshPubkeys.map(
                (pubkey) => ({ pubkey, depositDataRoot } as any),
              ),
            ),
        });

        expect(mockFetchEventsFallOver).toBeCalledTimes(1);
        expect(mockFetchEventsFallOver).toBeCalledWith(
          firstNotCachedBlock,
          currentBlock,
        );
      });

      it('should throw if event blockhash is different', async () => {
        const anotherBlockHash = '0x34';

        jest
          .spyOn(depositService, 'fetchEventsFallOver')
          .mockImplementation(async () => ({
            startBlock: firstNotCachedBlock,
            endBlock: currentBlock,
            events: freshPubkeys.map(
              (pubkey) =>
                ({
                  pubkey,
                  blockNumber: currentBlock,
                  blockHash: anotherBlockHash,
                } as any),
            ),
          }));

        await expect(
          depositService.getAllDepositedEvents(currentBlock, currentBlockHash),
        ).rejects.toThrow();
      });
    });

    describe('checkEventsBlockHash', () => {
      const events = [
        { blockNumber: 1, blockHash: '0x1' },
        { blockNumber: 2, blockHash: '0x2' },
      ] as any;

      it('should throw if blockhash is different', async () => {
        expect(() => {
          depositService.checkEventsBlockHash(events, 2, '0x3');
        }).toThrow();
      });

      it('should not throw if there are no events for the block', async () => {
        expect(() => {
          depositService.checkEventsBlockHash(events, 3, '0x3');
        }).not.toThrow();
      });

      it('should not throw if blockhash is the same', async () => {
        expect(() => {
          depositService.checkEventsBlockHash(events, 2, '0x2');
        }).not.toThrow();
      });
    });

    describe('getDepositRoot', () => {
      it('should return deposit root', async () => {
        const expected = '0x' + '0'.repeat(64);

        const mockProviderCall = jest
          .spyOn(providerService.provider, 'call')
          .mockImplementation(async () => {
            const iface = new Interface(DepositAbi__factory.abi);
            return iface.encodeFunctionResult('get_deposit_root', [expected]);
          });

        const result = await depositService.getDepositRoot();
        expect(result).toEqual(expected);
        expect(mockProviderCall).toBeCalledTimes(1);
      });
    });
  });
});
