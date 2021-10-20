import { Module } from '@nestjs/common';
import { ProviderModule } from 'provider';
import { SecurityModule } from 'contracts/security';
import { RegistryService } from './registry.service';

@Module({
  imports: [ProviderModule, SecurityModule],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
