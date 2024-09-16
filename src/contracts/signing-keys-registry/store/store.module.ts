import { DynamicModule, Module } from '@nestjs/common';
import { ProviderModule } from 'provider';
import { DB_DIR, DB_DEFAULT_VALUE, DB_LAYER_DIR } from './store.constants';
import { SigningKeysStoreService } from './store.service';

@Module({})
export class SigningKeysStoreModule {
  static register(
    defaultValue: unknown,
    cacheDir = 'cache',
    cacheLayerDir = 'add-sign-keys-cache',
  ): DynamicModule {
    return {
      module: SigningKeysStoreModule,
      imports: [ProviderModule],
      providers: [
        SigningKeysStoreService,
        {
          provide: DB_DIR,
          useValue: cacheDir,
        },
        {
          provide: DB_DEFAULT_VALUE,
          useValue: defaultValue,
        },
        {
          provide: DB_LAYER_DIR,
          useValue: cacheLayerDir,
        },
      ],
      exports: [SigningKeysStoreService],
    };
  }
}
