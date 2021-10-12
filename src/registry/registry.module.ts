import { Module } from '@nestjs/common';
import { LidoModule } from 'lido';
import { ProviderModule } from 'provider';
import { SecurityModule } from 'security';
import { RegistryService } from './registry.service';

@Module({
  imports: [LidoModule, ProviderModule, SecurityModule],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
