import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { ProviderService } from './provider.service';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';

describe('ProviderService', () => {
  let providerService: ProviderService;

  beforeEach(async () => {
    class MockRpcProvider extends JsonRpcProvider {
      async _uncachedDetectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        ProviderService,
        {
          provide: JsonRpcProvider,
          useValue: new MockRpcProvider(),
        },
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
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
});
