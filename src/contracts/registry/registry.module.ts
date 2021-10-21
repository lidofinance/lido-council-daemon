import { Module } from '@nestjs/common';
import { SecurityModule } from 'contracts/security';
import { RegistryService } from './registry.service';

@Module({
  imports: [SecurityModule],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
