import { Module } from '@nestjs/common';
import { LoggerModule } from 'common/logger';
import { LidoModule } from 'lido';
import { ProviderModule } from 'provider';
import { RegistryService } from './registry.service';

@Module({
  imports: [LoggerModule, LidoModule, ProviderModule],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
