import { Test } from '@nestjs/testing';
import { LoggerService } from '@nestjs/common';
import { getNetwork } from '@ethersproject/networks';
import { Logger } from '@ethersproject/logger';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { ProviderService } from './provider.service';
import { MockProviderModule } from 'provider';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

const logger = new Logger('');

describe('ProviderService', () => {
  let providerService: ProviderService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);
  });

  describe('getChainId', () => {
    it('should return chain id', async () => {
      const expected = 42;

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'getNetwork')
        .mockImplementation(async () => getNetwork(expected));

      const chainId = await providerService.getChainId();
      expect(chainId).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('getBlockNumber', () => {
    it('should return blockNumber from provider', async () => {
      const expected = 42;

      const mockBlockNumber = jest
        .spyOn(providerService.provider, 'blockNumber', 'get')
        .mockImplementation(() => expected);

      const mockGetBlockNumber = jest
        .spyOn(providerService.provider, 'getBlockNumber')
        .mockImplementation(async () => expected);

      const blockNumber = await providerService.getBlockNumber();
      expect(blockNumber).toBe(expected);
      expect(mockBlockNumber).toBeCalledTimes(1);
      expect(mockGetBlockNumber).not.toBeCalled();
    });

    it('should return fresh blockNumber if the cache is not collected yet', async () => {
      const expected = 42;

      const mockBlockNumber = jest
        .spyOn(providerService.provider, 'blockNumber', 'get')
        .mockImplementation(() => -1);

      const mockGetBlockNumber = jest
        .spyOn(providerService.provider, 'getBlockNumber')
        .mockImplementation(async () => expected);

      const blockNumber = await providerService.getBlockNumber();
      expect(blockNumber).toBe(expected);
      expect(mockBlockNumber).toBeCalledTimes(1);
      expect(mockGetBlockNumber).toBeCalledTimes(1);
    });
  });

  describe('getBlock', () => {
    it('should return block', async () => {
      const expected = {} as any;

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'getBlock')
        .mockImplementation(async () => expected);

      const block = await providerService.getBlock();
      expect(block).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
      expect(mockProviderCall).toBeCalledWith('latest');
    });
  });

  describe('fetchEventsFallOver', () => {
    it('should fetch recursive if missing response', async () => {
      const event1 = {} as any;
      const event2 = {} as any;
      const expectedFirst = {
        events: [event1],
        startBlock: 0,
        endBlock: 4,
        extraField: 'some value',
      };
      const expectedSecond = {
        events: [event2],
        startBlock: 5,
        endBlock: 10,
        extraField: 'some value',
      };

      const startBlock = 0;
      const endBlock = 10;

      const mockFetchEvents = jest
        .fn()
        .mockImplementationOnce(async () => {
          logger.throwError('missing response', Logger.errors.SERVER_ERROR, {});
        })
        .mockImplementationOnce(async () => expectedFirst)
        .mockImplementationOnce(async () => expectedSecond);

      const result = await providerService.fetchEventsFallOver(
        startBlock,
        endBlock,
        mockFetchEvents,
      );

      const { calls, results } = mockFetchEvents.mock;
      const events = [event1, event2];

      expect(Object.keys(result)).toHaveLength(3);
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
  });
});
