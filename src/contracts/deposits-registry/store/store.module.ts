import { DynamicModule, Module } from '@nestjs/common';
import { DB_DIR, DB_DEFAULT_VALUE, DB_LAYER_DIR } from './store.constants';
import { DepositsRegistryStoreService } from './store.service';

@Module({})
export class DepositsRegistryStoreModule {
  static register(
    defaultValue: unknown,
    cacheDir = 'cache',
    cacheLayerDir = 'deposit-cache',
  ): DynamicModule {
    return {
      module: DepositsRegistryStoreModule,
      providers: [
        DepositsRegistryStoreService,
        {
          provide: DB_DIR,
          useValue: cacheDir,
        },
        {
          provide: DB_LAYER_DIR,
          useValue: cacheLayerDir,
        },
        {
          provide: DB_DEFAULT_VALUE,
          useValue: defaultValue,
        },
      ],
      exports: [DepositsRegistryStoreService],
    };
  }
}
