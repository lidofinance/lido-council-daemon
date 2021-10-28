jest.mock('utils/sleep');

import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Interface } from '@ethersproject/abi';
import { LoggerService } from '@nestjs/common';
import { getNetwork } from '@ethersproject/networks';
import { Contract } from '@ethersproject/contracts';
import { hexZeroPad } from '@ethersproject/bytes';
import { sleep } from 'utils';
import { CacheService } from 'cache';
import {
  ERROR_LIMIT_EXCEEDED,
  MockProviderModule,
  ProviderService,
} from 'provider';
import { DepositAbi__factory } from 'generated';
import { SecurityService } from 'contracts/security';
import { DepositEventGroup } from './interfaces';
import { DepositModule } from './deposit.module';
import { DepositService } from './deposit.service';
import { PrometheusModule } from 'common/prometheus';
import { LoggerModule } from 'common/logger';
import { ConfigModule } from 'common/config';

const mockSleep = sleep as jest.MockedFunction<typeof sleep>;

describe('DepositService', () => {
  let providerService: ProviderService;
  let securityService: SecurityService;
  let cacheService: CacheService<DepositEventGroup>;
  let depositService: DepositService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        DepositModule,
        PrometheusModule,
        LoggerModule,
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    securityService = moduleRef.get(SecurityService);
    cacheService = moduleRef.get(CacheService);
    depositService = moduleRef.get(DepositService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);

    jest
      .spyOn(securityService, 'getDepositContractAddress')
      .mockImplementation(async () => hexZeroPad('0x1', 20));
  });

  describe('formatEvent', () => {
    it.todo('should return event in the correct format');
  });

  describe('getContract', () => {
    it('should return contract instance', async () => {
      const contract = await depositService.getContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should cache instance', async () => {
      const contract1 = await depositService.getContract();
      const contract2 = await depositService.getContract();
      expect(contract1).toBe(contract2);
    });
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

  describe('getCachedEvents', () => {
    const deploymentBlock = 100;

    beforeEach(async () => {
      jest
        .spyOn(depositService, 'getDeploymentBlockByNetwork')
        .mockImplementation(async () => deploymentBlock);
    });

    it('should return events from cache', async () => {
      const cache = {
        events: [{} as any],
        startBlock: deploymentBlock,
        endBlock: deploymentBlock + 100,
      };

      const mockCache = jest
        .spyOn(cacheService, 'getCache')
        .mockImplementation(async () => cache);

      const result = await depositService.getCachedEvents();

      expect(mockCache).toBeCalledTimes(1);
      expect(result).toEqual(cache);
    });

    it('should return deploymentBlock if cache is empty', async () => {
      const cache = {
        events: [{} as any],
        startBlock: 0,
        endBlock: 0,
      };

      const mockCache = jest
        .spyOn(cacheService, 'getCache')
        .mockImplementation(async () => cache);

      const result = await depositService.getCachedEvents();

      expect(mockCache).toBeCalledTimes(1);
      expect(result.startBlock).toBe(deploymentBlock);
      expect(result.endBlock).toBe(deploymentBlock);
    });
  });

  describe('setCachedEvents', () => {
    it('should call setCache from the cacheService', async () => {
      const eventGroup = {} as any;

      const mockSetCache = jest
        .spyOn(cacheService, 'setCache')
        .mockImplementation(async () => undefined);

      await depositService.setCachedEvents(eventGroup);

      expect(mockSetCache).toBeCalledTimes(1);
      expect(mockSetCache).toBeCalledWith(eventGroup);
    });
  });

  describe('fetchEventsFallOver', () => {
    it('should fetch events', async () => {
      const expected = {} as any;
      const from = 0;
      const to = 10;

      const mockFetchEvents = jest
        .spyOn(depositService, 'fetchEvents')
        .mockImplementation(async () => expected);

      const result = await depositService.fetchEventsFallOver(from, to);

      expect(mockFetchEvents).toBeCalledTimes(1);
      expect(mockFetchEvents).toBeCalledWith(from, to);
      expect(result).toBe(expected);
    });

    it('should fetch recursive if limit exceeded', async () => {
      const event1 = {} as any;
      const event2 = {} as any;
      const expectedFirst = { events: [event1], startBlock: 0, endBlock: 4 };
      const expectedSecond = { events: [event2], startBlock: 5, endBlock: 10 };

      const startBlock = 0;
      const endBlock = 10;

      const mockFetchEvents = jest
        .spyOn(depositService, 'fetchEvents')
        .mockImplementationOnce(async () => {
          throw { error: { code: ERROR_LIMIT_EXCEEDED } };
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
    const cachedEvents = {
      startBlock: 0,
      endBlock: 2,
      events: cachedPubkeys.map((pubkey) => ({ pubkey } as any)),
    };
    const currentBlock = 1000;
    const firstNotCachedBlock = cachedEvents.endBlock + 1;

    beforeEach(async () => {
      jest
        .spyOn(depositService, 'getCachedEvents')
        .mockImplementation(async () => cachedEvents);

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
        .spyOn(depositService, 'setCachedEvents')
        .mockImplementation(async () => undefined);

      await depositService.updateEventsCache();

      expect(mockSetCachedEvents).toBeCalledTimes(1);
      const { calls: cacheCalls } = mockSetCachedEvents.mock;
      expect(cacheCalls[0][0].startBlock).toBe(cachedEvents.startBlock);
      expect(cacheCalls[0][0].endBlock).toBeLessThan(currentBlock);
      expect(cacheCalls[0][0].events).toEqual(cachedEvents.events);
    });
  });

  describe('getAllDepositedEvents', () => {
    const cachedPubkeys = ['0x1234', '0x5678'];
    const freshPubkeys = ['0x4321', '0x8765'];
    const cachedEvents = {
      startBlock: 0,
      endBlock: 2,
      events: cachedPubkeys.map((pubkey) => ({ pubkey } as any)),
    };
    const currentBlock = 10;
    const firstNotCachedBlock = cachedEvents.endBlock + 1;

    beforeEach(async () => {
      jest
        .spyOn(depositService, 'getCachedEvents')
        .mockImplementation(async () => cachedEvents);

      jest
        .spyOn(providerService, 'getBlockNumber')
        .mockImplementation(async () => currentBlock);
    });

    it('should return cached events', async () => {
      const mockFetchEventsFallOver = jest
        .spyOn(depositService, 'fetchEventsFallOver')
        .mockImplementation(async () => ({
          startBlock: firstNotCachedBlock,
          endBlock: currentBlock,
          events: [],
        }));

      const result = await depositService.getAllDepositedEvents(currentBlock);
      expect(result).toEqual({ ...cachedEvents, endBlock: currentBlock });

      expect(mockFetchEventsFallOver).toBeCalledTimes(1);
      expect(mockFetchEventsFallOver).toBeCalledWith(
        firstNotCachedBlock,
        currentBlock,
      );
    });

    it('should return merged pub keys', async () => {
      const mockFetchEventsFallOver = jest
        .spyOn(depositService, 'fetchEventsFallOver')
        .mockImplementation(async () => ({
          startBlock: firstNotCachedBlock,
          endBlock: currentBlock,
          events: freshPubkeys.map((pubkey) => ({ pubkey } as any)),
        }));

      const result = await depositService.getAllDepositedEvents(currentBlock);
      expect(result).toEqual({
        startBlock: cachedEvents.startBlock,
        endBlock: currentBlock,
        events: cachedPubkeys
          .concat(freshPubkeys)
          .map((pubkey) => ({ pubkey } as any)),
      });
      expect(mockFetchEventsFallOver).toBeCalledTimes(1);
      expect(mockFetchEventsFallOver).toBeCalledWith(
        firstNotCachedBlock,
        currentBlock,
      );
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
