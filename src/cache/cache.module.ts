import { DynamicModule, Module } from '@nestjs/common';
import { CACHE_DEFAULT_VALUE, CACHE_FILE_NAME } from 'cache';
import { ProviderModule } from 'provider';
import { CACHE_DIR } from './cache.constants';
import { CacheService } from './cache.service';

@Module({})
export class CacheModule {
  static register(fileName: string, defaultValue: unknown): DynamicModule {
    return {
      module: CacheModule,
      imports: [ProviderModule],
      providers: [
        CacheService,
        {
          provide: CACHE_DIR,
          useValue: 'cache',
        },
        {
          provide: CACHE_FILE_NAME,
          useValue: fileName,
        },
        {
          provide: CACHE_DEFAULT_VALUE,
          useValue: defaultValue,
        },
      ],
      exports: [CacheService],
    };
  }
}
