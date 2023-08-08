import { DynamicModule, Module } from '@nestjs/common';
import {
  CACHE_BATCH_SIZE,
  CACHE_DEFAULT_VALUE,
  CACHE_FILE_NAME,
  CACHE_VALUE_TYPE,
} from 'cache';
import { ProviderModule } from 'provider';
import { CACHE_DIR } from './cache.constants';
import { CacheService } from './cache.service';
import * as z from 'zod';

@Module({})
export class CacheModule {
  static register<T>(
    filePrefix: string,
    batchSize: number,
    defaultValueType: z.ZodType<T>,
    defaultValue: T,
  ): DynamicModule {
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
          useValue: filePrefix,
        },
        {
          provide: CACHE_BATCH_SIZE,
          useValue: batchSize,
        },
        {
          provide: CACHE_DEFAULT_VALUE,
          useValue: defaultValue,
        },
        {
          provide: CACHE_VALUE_TYPE,
          useValue: defaultValueType,
        },
      ],
      exports: [CacheService],
    };
  }
}
