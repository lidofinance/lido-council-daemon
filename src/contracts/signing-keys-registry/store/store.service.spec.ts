import { Test } from '@nestjs/testing';
import { MockProviderModule } from 'provider';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { SigningKeysStoreModule } from './store.module';
import { SigningKeysStoreService } from './store.service';
import { cacheMock, eventsMock1, keyMock1 } from './store.fixtures';

describe('dbService', () => {
  const defaultCacheValue = {
    headers: {},
    data: [] as any[],
  };

  let dbService: SigningKeysStoreService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PrometheusModule,
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        SigningKeysStoreModule.register(
          defaultCacheValue,
          'leveldb-spec',
          'signing-keys-spec',
        ),
        LoggerModule,
      ],
    }).compile();

    dbService = moduleRef.get(SigningKeysStoreService);
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
    await expect(dbService.getCachedEvents([keyMock1])).resolves.toEqual(
      defaultCacheValue,
    );
    await expect(dbService.getHeader()).resolves.toEqual(defaultCacheValue);
  });

  it('should reject corrupt stored headers', async () => {
    await (dbService as any).db.put('headers', '{');

    await expect(dbService.getEventsCache()).rejects.toThrow(SyntaxError);
    await expect(dbService.getCachedEvents([keyMock1])).rejects.toThrow(
      SyntaxError,
    );
    await expect(dbService.getHeader()).rejects.toThrow(SyntaxError);
  });

  it('should reject reads from a closed database', async () => {
    await dbService.close();

    await expect(dbService.getEventsCache()).rejects.toThrow();
    await expect(dbService.getCachedEvents([keyMock1])).rejects.toThrow();
    await expect(dbService.getHeader()).rejects.toThrow();
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
