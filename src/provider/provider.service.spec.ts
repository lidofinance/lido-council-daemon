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
    it('should fetch by chunks of 50 blocks when error occurs', async () => {
      // Set up test data
      const startBlock = 0;
      const endBlock = 100;

      // Create mock events
      const event1 = { id: 1 } as any;
      const event2 = { id: 2 } as any;

      const mockFetchEvents = jest
        .fn()
        // First call fails with server error
        .mockImplementationOnce(async () => {
          logger.throwError('missing response', Logger.errors.SERVER_ERROR, {});
        })
        // The next calls should be for chunks of 50 blocks
        .mockImplementationOnce(async (start, end) => ({
          events: [event1],
          startBlock: start,
          endBlock: end,
        }))
        .mockImplementationOnce(async (start, end) => ({
          events: [event2],
          startBlock: start,
          endBlock: end,
        }))
        // The remaining chunks
        .mockImplementation(async (start, end) => ({
          events: [],
          startBlock: start,
          endBlock: end,
        }));

      const result = await providerService.fetchEventsFallOver(
        startBlock,
        endBlock,
        mockFetchEvents,
      );

      const { calls } = mockFetchEvents.mock;

      // We expect the initial call plus enough calls to cover chunks of 50 blocks
      expect(mockFetchEvents).toHaveBeenCalledTimes(4); // Initial call + 3 chunk calls

      // First call is the initial attempt that fails
      expect(calls[0]).toEqual([startBlock, endBlock]);

      // Check that subsequent calls are properly chunked
      expect(calls[1]).toEqual([0, 49]); // First chunk
      expect(calls[2]).toEqual([50, 99]); // Second chunk
      expect(calls[3]).toEqual([100, 100]); // Third chunk

      // Verify the combined results
      expect(result).toEqual({
        events: [event1, event2],
        startBlock,
        endBlock,
      });
    });
  });
});
