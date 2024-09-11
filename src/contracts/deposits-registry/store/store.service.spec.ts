import { Test } from '@nestjs/testing';
import { MockProviderModule } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { DepositsRegistryStoreModule } from './store.module';
import { DepositsRegistryStoreService } from './store.service';
import { cacheMock } from './store.fixtures';

describe('dbService', () => {
  const defaultCacheValue = {
    headers: {},
    data: [] as any[],
  };

  let dbService: DepositsRegistryStoreService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        DepositsRegistryStoreModule.register(defaultCacheValue, 'leveldb-spec'),
        LoggerModule,
      ],
    }).compile();

    dbService = moduleRef.get(DepositsRegistryStoreService);
    await dbService.initialize();
  });

  afterEach(async () => {
    try {
      await dbService.deleteCache();
      await dbService.close();
    } catch (error) {}
  });

  it('should return default cache', async () => {
    const result = await dbService.getEventsCache();
    expect(result).toEqual(defaultCacheValue);
  });

  it('should return saved cache', async () => {
    const expected = cacheMock;

    await dbService.insertEventsCacheBatch(expected);
    const result = await dbService.getEventsCache();

    expect(result).toEqual(expected);
  });
});
