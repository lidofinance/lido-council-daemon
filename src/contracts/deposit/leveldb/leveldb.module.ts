import { DynamicModule, Module } from '@nestjs/common';
import { ProviderModule } from 'provider';
import { DB_DIR, DB_DEFAULT_VALUE } from './leveldb.constants';
import { LevelDBService } from './leveldb.service';

@Module({})
export class LevelDBModule {
  static register(
    defaultValue: unknown,
    cacheDir = 'leveldb-cache',
  ): DynamicModule {
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
          provide: DB_DEFAULT_VALUE,
          useValue: defaultValue,
        },
      ],
      exports: [LevelDBService],
    };
  }
}
