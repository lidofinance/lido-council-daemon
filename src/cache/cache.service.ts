import { Inject, Injectable } from '@nestjs/common';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import {
  CACHE_DIR,
  CACHE_DEFAULT_VALUE,
  CACHE_FILE_NAME,
  CACHE_BATCH_SIZE,
} from './cache.constants';
import { ProviderService } from 'provider';

@Injectable()
export class CacheService<
  H extends unknown,
  D extends unknown,
  T extends { headers: H; data: D[] } = { headers: H; data: D[] },
> {
  constructor(
    private providerService: ProviderService,
    @Inject(CACHE_DIR) private cacheDir: string,
    @Inject(CACHE_FILE_NAME) private cacheFile: string,
    @Inject(CACHE_BATCH_SIZE) private cacheBatchSize: number,
    @Inject(CACHE_DEFAULT_VALUE) private cacheDefaultValue: T,
  ) {}

  private cache: T | null = null;

  public async getCache(): Promise<T> {
    if (!this.cache) {
      this.cache = await this.getCacheFromFiles();
    }

    return this.cache;
  }

  public async setCache(cache: T): Promise<void> {
    this.cache = cache;
    return await this.saveCacheToFiles();
  }

  public async deleteCache(): Promise<void> {
    this.cache = null;
    return await this.deleteCacheFiles();
  }

  private async getCacheDirPath(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    const networkDir = `chain-${chainId}`;

    return join(this.cacheDir, networkDir);
  }

  private getCacheFileName(batchIndex: number): string {
    return `${batchIndex}.${this.cacheFile}`;
  }

  private async getCacheFilePaths(): Promise<string[]> {
    const dirPath = await this.getCacheDirPath();
    const result = await glob(`*([0-9]).${this.cacheFile}`, { cwd: dirPath });

    return result
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map((filePath) => join(dirPath, filePath));
  }

  private async getCacheFromFiles(): Promise<T> {
    try {
      const filePaths = await this.getCacheFilePaths();

      let headers = this.cacheDefaultValue.headers as H;
      let data = [] as D[];

      await Promise.all(
        filePaths.map(async (filePath) => {
          const content = await readFile(filePath);
          const parsed = JSON.parse(String(content));

          if (
            JSON.stringify(headers) !== JSON.stringify(parsed.headers) &&
            headers !== this.cacheDefaultValue.headers
          ) {
            throw new Error('Headers are not equal');
          }

          headers = parsed.headers;
          data = data.concat(parsed.data);
        }),
      );

      return { headers, data } as T;
    } catch (error) {
      return this.cacheDefaultValue;
    }
  }

  private async saveCacheToFiles(): Promise<void> {
    if (!this.cache) throw new Error('Cache is not set');

    const { headers, data } = this.cache;

    const dirPath = await this.getCacheDirPath();
    await mkdir(dirPath, { recursive: true });

    await this.deleteCacheFiles();

    const totalBatches = Math.ceil(data.length / this.cacheBatchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const from = batchIndex * this.cacheBatchSize;
      const to = (batchIndex + 1) * this.cacheBatchSize;
      const batchedData = data.slice(from, to);

      const filePath = join(dirPath, this.getCacheFileName(batchIndex));
      await writeFile(filePath, JSON.stringify({ headers, data: batchedData }));
    }
  }

  private async deleteCacheFiles(): Promise<void> {
    try {
      const filePaths = await this.getCacheFilePaths();
      await Promise.all(filePaths.map(async (filePath) => unlink(filePath)));
    } catch (error) {}
  }
}
