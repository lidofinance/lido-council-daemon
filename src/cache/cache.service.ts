import { Inject, Injectable } from '@nestjs/common';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import {
  CACHE_DIR,
  CACHE_DEFAULT_VALUE,
  CACHE_FILE_NAME,
} from './cache.constants';
import { ProviderService } from 'provider';

@Injectable()
export class CacheService<T extends unknown> {
  constructor(
    private providerService: ProviderService,
    @Inject(CACHE_DIR) private cacheDir: string,
    @Inject(CACHE_FILE_NAME) private cacheFile: string,
    @Inject(CACHE_DEFAULT_VALUE) private cacheDefaultValue: T,
  ) {}

  private cache: T | null = null;

  public async getCache(): Promise<T> {
    if (!this.cache) {
      this.cache = await this.getCacheFromFile();
    }

    return this.cache;
  }

  public async setCache(cache: T): Promise<void> {
    this.cache = cache;
    return await this.saveCacheToFile();
  }

  public async deleteCache(): Promise<void> {
    this.cache = null;
    return await this.deleteCacheFile();
  }

  private async getCacheDirPath(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    const networkDir = `chain-${chainId}`;

    return join(this.cacheDir, networkDir);
  }

  private async getCacheFilePath(): Promise<string> {
    const dir = await this.getCacheDirPath();
    return join(dir, this.cacheFile);
  }

  private async getCacheFromFile(): Promise<T> {
    try {
      const filePath = await this.getCacheFilePath();
      const content = await readFile(filePath);
      return JSON.parse(String(content));
    } catch (error) {
      return this.cacheDefaultValue;
    }
  }

  private async saveCacheToFile(): Promise<void> {
    const dirPath = await this.getCacheDirPath();
    const filePath = await this.getCacheFilePath();
    await mkdir(dirPath, { recursive: true });

    return await writeFile(filePath, JSON.stringify(this.cache));
  }

  private async deleteCacheFile(): Promise<void> {
    const filePath = await this.getCacheFilePath();

    return await unlink(filePath);
  }
}
