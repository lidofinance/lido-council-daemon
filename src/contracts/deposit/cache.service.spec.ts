import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { ProviderModule } from 'provider';
import { DEPOSIT_CACHE_DEFAULT } from './cache.constants';
import { DepositCacheService } from './cache.service';

describe('DepositCacheService', () => {
  let cacheService: DepositCacheService;

  beforeEach(async () => {
    class MockRpcProvider extends JsonRpcProvider {
      async _uncachedDetectNetwork() {
        return getNetwork(0);
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), ProviderModule],
      providers: [DepositCacheService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    cacheService = moduleRef.get(DepositCacheService);
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
