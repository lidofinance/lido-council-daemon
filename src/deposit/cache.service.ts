import { Injectable } from '@nestjs/common';
import { DepositEventGroup, DepositEventsCache } from './interfaces';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import {
  DEPOSIT_CACHE_DEFAULT,
  DEPOSIT_CACHE_FILE,
  DEPOSIT_CACHE_DIR,
} from './cache.constants';
import { ProviderService } from 'provider';

@Injectable()
export class DepositCacheService {
  constructor(private providerService: ProviderService) {}

  private cache: DepositEventsCache | null = null;

  public async getCache(): Promise<DepositEventsCache> {
    if (!this.cache) {
      this.cache = await this.getCacheFromFile();
    }

    return this.cache;
  }

  public async setCache(cache: DepositEventsCache): Promise<void> {
    this.cache = cache;
    return await this.saveCacheToFile();
  }

  public async deleteCache(): Promise<void> {
    return await this.deleteCacheFile();
  }

  private async getCacheDirPath(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    const networkDir = `chain-${chainId}`;

    return join(DEPOSIT_CACHE_DIR, networkDir);
  }

  private async getCacheFilePath(): Promise<string> {
    const dir = await this.getCacheDirPath();
    return join(dir, DEPOSIT_CACHE_FILE);
  }

  private async getCacheFromFile(): Promise<DepositEventGroup> {
    try {
      const filePath = await this.getCacheFilePath();
      const content = await readFile(filePath);
      return JSON.parse(String(content));
    } catch (error) {
      return DEPOSIT_CACHE_DEFAULT;
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
