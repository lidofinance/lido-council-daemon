import { Module } from '@nestjs/common';
import { LidoModule } from 'lido';
import { ProviderModule } from 'provider';
import { RegistryService } from './registry.service';

@Module({
  imports: [LidoModule, ProviderModule],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
