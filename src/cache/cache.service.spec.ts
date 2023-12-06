import { Test } from '@nestjs/testing';
import { MockProviderModule } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { CacheModule } from 'cache';
import { CacheService } from './cache.service';
import * as z from 'zod';

describe('CacheService', () => {
  const Data = z.object({
    foo: z.string(),
  });
  type Data = z.infer<typeof Data>;

  const Headers = z.object({
    version: z.string(),
    somethingElse: z.number(),
  });
  type Headers = z.infer<typeof Headers>;

  const CacheValueType = z.object({
    headers: Headers,
    data: z.array(Data),
  });

  type CacheValueType = z.infer<typeof CacheValueType>;

  const defaultCacheValue: CacheValueType = {
    headers: {
      version: '0.0.0',
      somethingElse: 42,
    },
    data: [],
  };

  const batchSize = 10;

  const cacheFilePrefix = 'test.json';
  let cacheService: CacheService<Headers, Data>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        CacheModule.register(
          cacheFilePrefix,
          batchSize,
          CacheValueType,
          defaultCacheValue,
        ),
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
      expect(result).toEqual(defaultCacheValue);
    });

    it('should return saved cache', async () => {
      const expected: CacheValueType = {
        headers: { version: '0.0.0', somethingElse: 1 },
        data: [{ foo: 'bar' }],
      };

      await cacheService.setCache(expected);
      const result = await cacheService.getCache();
      expect(result).toEqual(expected);
    });
  });
});
