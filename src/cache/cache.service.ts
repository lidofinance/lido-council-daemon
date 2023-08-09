import { Inject, Injectable, LoggerService } from '@nestjs/common';
import {
  CACHE_DIR,
  CACHE_DEFAULT_VALUE,
  CACHE_FILE_NAME,
  CACHE_BATCH_SIZE,
  CACHE_VALUE_TYPE,
} from './cache.constants';
import { ProviderService } from 'provider';
import {
  CacheData,
  CacheDirWithChainId,
  CacheHeaders,
  CacheStats,
  Json,
  Stats,
} from './types';
import {
  deleteAllCacheFiles,
  getCacheFilePaths,
  makeCacheFileName,
  validateCacheFilePathsOrFail,
} from './utils';
import { basename, join } from 'path';
import * as z from 'zod';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { CacheError } from './errors';
import { mkdir, readFile, writeFile } from 'fs/promises';

@Injectable()
export class CacheService<
  Headers extends CacheHeaders,
  Data extends CacheData,
> {
  constructor(
    private providerService: ProviderService,
    @Inject(CACHE_DIR) private cacheDir: string,
    @Inject(CACHE_FILE_NAME) private cacheFileName: string,
    @Inject(CACHE_BATCH_SIZE) private cacheBatchSize: number,
    @Inject(CACHE_DEFAULT_VALUE)
    private cacheDefaultValue: { headers: Headers; data: Data[] },
    @Inject(CACHE_VALUE_TYPE)
    private cacheValueType: z.ZodType<{ headers: Headers; data: Data[] }>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger?: LoggerService,
  ) {
    if (!this.cacheFileName) {
      throw new CacheError('Empty cache file name');
    }
  }

  private cache: { headers: Headers; data: Data[] } | null = null;

  public async getCache(): Promise<{ headers: Headers; data: Data[] }> {
    if (!this.cache) {
      const cacheDir = await this.getCacheDirPath();
      const filePaths = await getCacheFilePaths(cacheDir, this.cacheFileName);
      this.cache = await this.readCacheFromFiles(
        filePaths,
        this.cacheValueType,
        this.cacheDefaultValue,
      );
    }

    return this.cache;
  }

  public async setCache(cache: {
    headers: Headers;
    data: Data[];
  }): Promise<void> {
    this.cache = cache;
    return await this.writeCacheToFiles(
      this.cache,
      await this.getCacheDirPath(),
      this.cacheFileName,
      this.cacheBatchSize,
    );
  }

  public async deleteCache(): Promise<void> {
    this.cache = null;
    const cacheDir = await this.getCacheDirPath();
    const filePaths = await getCacheFilePaths(cacheDir, this.cacheFileName);
    await deleteAllCacheFiles(filePaths);
  }

  private async getCacheDirPath(): Promise<CacheDirWithChainId> {
    const chainId = await this.providerService.getChainId();
    const networkDir = `chain-${chainId}`;

    return <CacheDirWithChainId>join(this.cacheDir, networkDir);
  }

  private async writeCacheToFiles(
    cache: { headers: Headers; data: Data[] },
    cacheDir: CacheDirWithChainId,
    cacheFilePostfix: string,
    cacheDataBatchSize: number,
  ): Promise<void> {
    const { headers, data } = cache;

    await mkdir(cacheDir, { recursive: true });
    const filePaths = await getCacheFilePaths(cacheDir, cacheFilePostfix);
    await deleteAllCacheFiles(filePaths);
    await mkdir(cacheDir, { recursive: true });

    const dataTotalLength = data.length;
    const totalBatches = Math.ceil(data.length / cacheDataBatchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const from = batchIndex * cacheDataBatchSize;
      const to = (batchIndex + 1) * cacheDataBatchSize;
      const batchedData = data.slice(from, to);

      const filePath = join(
        cacheDir,
        makeCacheFileName(batchIndex, cacheFilePostfix),
      );

      await this.writeCacheFile(filePath, {
        headers: headers,
        stats: { dataTotalLength },
        data: batchedData,
      });
    }
  }

  private async writeCacheFile(
    filePath: string,
    content: { headers: Headers; data: Data[]; stats: Stats },
  ): Promise<void> {
    let contentToWrite = '';
    try {
      contentToWrite = JSON.stringify(
        {
          headers: content.headers,
          stats: content.stats,
          data: content.data,
        },
        null,
        ' ',
      );
    } catch (err) {
      throw new CacheError(`Can't stringify cache content`, err);
    }

    await writeFile(filePath, contentToWrite, 'utf-8');
  }

  private async readCacheFromFiles(
    filePaths: string[],
    valueType: z.ZodType<{ headers: Headers; data: Data[] }>,
    defaultValue: { headers: Headers; data: Data[] },
  ): Promise<{ headers: Headers; data: Data[] }> {
    try {
      validateCacheFilePathsOrFail(filePaths);

      const cacheType = z.intersection(CacheStats, valueType);

      const allContents = await Promise.all(
        filePaths.map(async (filePath) => {
          return await this.readCacheFile(filePath, cacheType);
        }),
      );

      if (allContents.length < 1) {
        return defaultValue;
      }

      // checking that all headers are equal
      const allHeadersEqual = allContents.every(
        (content, i, arr) =>
          JSON.stringify(arr[0]?.headers ?? '') ===
          JSON.stringify(content.headers),
      );

      if (!allHeadersEqual) {
        throw new CacheError('Cache headers are not equal');
      }

      // checking that all stats equal
      const allStatsAreEqual = allContents.every(
        (content, i, arr) =>
          JSON.stringify(arr[0]?.stats?.dataTotalLength ?? 0) ===
          JSON.stringify(content.stats.dataTotalLength),
      );

      if (!allStatsAreEqual) {
        throw new CacheError('Cache stats are not equal');
      }

      const headers: Headers = allContents[0].headers;
      const stats = allContents[0].stats;

      const data: Data[] = allContents.reduce(
        (accumulator, content) => accumulator.concat(content.data),
        <Data[]>[],
      );

      if (stats.dataTotalLength !== data.length) {
        throw new CacheError(
          'Headers data length does not match real data length',
        );
      }

      return { headers, data };
    } catch (error) {
      this.logger?.warn('Deposit events cache will be set to a default value', {
        error,
      });

      return defaultValue;
    }
  }

  private async readCacheFile(
    filePath: string,
    valueType: z.ZodType<{ headers: Headers; data: Data[]; stats: Stats }>,
  ): Promise<{ headers: Headers; data: Data[]; stats: Stats }> {
    const content = await readFile(filePath, 'utf-8');
    const parsed: Json = JSON.parse(content);

    const res = valueType.safeParse(parsed);

    if (res.success) {
      return res.data;
    }

    throw new CacheError(
      `Cache file [${basename(filePath)}] integrity error`,
      res.error,
    );
  }
}
