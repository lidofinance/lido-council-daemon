import { Module } from '@nestjs/common';
import { CacheModule } from 'cache';
import { SecurityModule } from 'contracts/security';
import { RegistryService } from './registry.service';
import {
  REGISTRY_CACHE_DEFAULT,
  REGISTRY_CACHE_FILE_NAME,
} from './registry.constants';

@Module({
  imports: [
    SecurityModule,
    CacheModule.register(REGISTRY_CACHE_FILE_NAME, REGISTRY_CACHE_DEFAULT),
  ],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
