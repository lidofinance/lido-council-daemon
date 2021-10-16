jest.mock('utils/sleep');

import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { LidoModule, LidoService } from 'lido';
import {
  ERROR_LIMIT_EXCEEDED,
  ProviderModule,
  ProviderService,
} from 'provider';
import { DepositService } from './deposit.service';
import { DepositCacheService } from './cache.service';
import { Interface } from '@ethersproject/abi';
import { DepositAbi__factory } from 'generated';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { getNetwork } from '@ethersproject/networks';
import { Contract } from '@ethersproject/contracts';
import { hexZeroPad } from '@ethersproject/bytes';
import { JsonRpcProvider } from '@ethersproject/providers';
import { sleep } from 'utils';

const mockSleep = sleep as jest.MockedFunction<typeof sleep>;

describe('DepositService', () => {
  let providerService: ProviderService;
  let lidoService: LidoService;
  let cacheService: DepositCacheService;
  let depositService: DepositService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    class MockRpcProvider extends JsonRpcProvider {
      async _uncachedDetectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        LoggerModule,
        LidoModule,
        ProviderModule,
      ],
      providers: [DepositService, DepositCacheService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    providerService = moduleRef.get(ProviderService);
    lidoService = moduleRef.get(LidoService);
    cacheService = moduleRef.get(DepositCacheService);
    depositService = moduleRef.get(DepositService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);

    jest
      .spyOn(lidoService, 'getDepositContractAddress')
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
    it.todo('should fetch events');
  });

  describe('getFreshEvents', () => {
    it.todo('should fetch fresh events');
  });

  describe('subscribeToEthereumUpdates', () => {
    it.todo('should subscribe to block event');
  });

  describe('initialize', () => {
    it.todo('should collect cache');
    it.todo('should subscribe to updates');
  });

  describe('cacheEventsWrapped', () => {
    it.todo('should call cacheEvents');
  });

  describe('cacheEvents', () => {
    it.todo('should collect events');
    it.todo('should start collecting from the last cached block + 1');
    it.todo('should save events to the cache');
    it.todo('should exit if the previous call is not completed');
  });

  describe('getAllDepositedPubKeys', () => {
    const cachedPubkeys = ['0x1234', '0x5678'];
    const freshPubkeys = ['0x4321', '0x8765'];

    beforeEach(async () => {
      jest.spyOn(cacheService, 'getCache').mockImplementation(async () => ({
        startBlock: 0,
        endBlock: 2,
        events: cachedPubkeys.map((pubkey) => ({ pubkey } as any)),
      }));

      jest
        .spyOn(providerService.provider, 'getBlockNumber')
        .mockImplementation(async () => 3);
    });

    it('should return cached pub keys', async () => {
      const providerCall = jest
        .spyOn(providerService.provider, 'getLogs')
        .mockImplementation(async () => []);

      const result = await depositService.getAllDepositedPubKeys();
      const expected = new Set(cachedPubkeys);
      expect(result).toEqual(expected);
      expect(providerCall).toHaveBeenCalledTimes(1);
    });

    it('should return merged pub keys', async () => {
      const providerCall = jest
        .spyOn(providerService.provider, 'getLogs')
        .mockImplementation(async () => {
          const iface = new Interface(DepositAbi__factory.abi);
          const eventFragment = iface.getEvent('DepositEvent');

          return freshPubkeys.map((pubkey) => {
            const args = [pubkey, '0x', '0x', '0x', 1];
            return iface.encodeEventLog(eventFragment, args) as any;
          });
        });

      const result = await depositService.getAllDepositedPubKeys();
      const expected = new Set(cachedPubkeys.concat(freshPubkeys));
      expect(result).toEqual(expected);
      expect(providerCall).toHaveBeenCalledTimes(1);
    });

    it.todo('should throw if cache is old');
  });

  describe('getDepositRoot', () => {
    it('should return deposit root', async () => {
      const expected = '0x' + '0'.repeat(64);

      const providerCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(DepositAbi__factory.abi);
          return iface.encodeFunctionResult('get_deposit_root', [expected]);
        });

      const result = await depositService.getDepositRoot();
      expect(result).toEqual(expected);
      expect(providerCall).toHaveBeenCalledTimes(1);
    });
  });
});
