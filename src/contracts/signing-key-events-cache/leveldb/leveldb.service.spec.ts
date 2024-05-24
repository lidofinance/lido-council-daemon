import { Test } from '@nestjs/testing';
import { MockProviderModule } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { LevelDBModule } from './leveldb.module';
import { LevelDBService } from './leveldb.service';
import { cacheMock, eventsMock1, keyMock1 } from './levedb.fixtures';

describe('dbService', () => {
  const defaultCacheValue = {
    headers: {},
    data: [] as any[],
  };

  let dbService: LevelDBService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LevelDBModule.register(defaultCacheValue, 'leveldb-signing-keys-spec'),
        LoggerModule,
      ],
    }).compile();

    dbService = moduleRef.get(LevelDBService);
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

    expect(result.headers).toEqual(expected.headers);
    expect(result.data.length).toEqual(expected.data.length);
    expect(result.data).toEqual(expect.arrayContaining(expected.data));
  });

  it('should return all values with the same key, node operator and module address', async () => {
    await dbService.insertEventsCacheBatch(cacheMock);
    const result = await dbService.getCachedEvents([keyMock1]);
    const expected = eventsMock1;

    expect(result.headers).toEqual(cacheMock.headers);
    expect(result.data.length).toEqual(expected.length);
    expect(result.data).toEqual(expect.arrayContaining(expected));
  });
});
