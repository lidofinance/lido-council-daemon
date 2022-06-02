import { Test } from '@nestjs/testing';
import { MockProviderModule } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { CacheModule } from 'cache';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  const defaultCacheValue = {};
  const cacheFile = 'test.json';
  let cacheService: CacheService<typeof defaultCacheValue>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        CacheModule.register(cacheFile, defaultCacheValue),
        LoggerModule,
      ],
    }).compile();

    cacheService = moduleRef.get(CacheService);
  });

  afterEach(async () => {
    try {
      await cacheService.deleteCache();
    } catch (error) {}
  });

  describe('getCache, setCache', () => {
    it('should return default cache', async () => {
      const result = await cacheService.getCache();
      expect(result).toBe(defaultCacheValue);
    });

    it('should return saved cache', async () => {
      const expected = { foo: 'bar' };

      await cacheService.setCache(expected);
      const result = await cacheService.getCache();
      expect(result).toEqual(expected);
    });
  });
});
