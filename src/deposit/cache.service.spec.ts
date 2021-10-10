import { Test } from '@nestjs/testing';
import { ProviderModule, ProviderService } from 'provider';
import { DEPOSIT_CACHE_DEFAULT } from './cache.constants';
import { DepositCacheService } from './cache.service';

describe('DepositCacheService', () => {
  let providerService: ProviderService;
  let cacheService: DepositCacheService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProviderModule],
      providers: [DepositCacheService],
      exports: [DepositCacheService],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    cacheService = moduleRef.get(DepositCacheService);

    jest.spyOn(providerService, 'getChainId').mockImplementation(async () => 0);
  });

  afterEach(async () => {
    try {
      await cacheService.deleteCache();
    } catch (error) {}
  });

  describe('getCache, setCache', () => {
    it('should return default cache', async () => {
      const result = await cacheService.getCache();
      expect(result).toBe(DEPOSIT_CACHE_DEFAULT);
    });

    it('should return saved cache', async () => {
      const expectedEvent = { pubkey: '0x1' } as any;
      const expected = { startBlock: 1, endBlock: 2, events: [expectedEvent] };

      await cacheService.setCache(expected);
      const result = await cacheService.getCache();
      expect(result).toEqual(expected);
    });
  });
});
