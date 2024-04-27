import { DynamicModule, Module } from '@nestjs/common';
import { CACHE_DEFAULT_VALUE } from 'cache';
import { ProviderModule } from 'provider';
import { DB_DIR } from './leveldb.constants';
import { LevelDBService } from './leveldb.service';

@Module({})
export class LevelDBModule {
  static register(defaultValue: unknown, cacheDir = 'cache'): DynamicModule {
    return {
      module: LevelDBModule,
      imports: [ProviderModule],
      providers: [
        LevelDBService,
        {
          provide: DB_DIR,
          useValue: cacheDir,
        },
        {
          provide: CACHE_DEFAULT_VALUE,
          useValue: defaultValue,
        },
      ],
      exports: [LevelDBService],
    };
  }
}
