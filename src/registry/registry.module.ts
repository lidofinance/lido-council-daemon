import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'common/logger';
import { LidoService } from 'lido';
import { ProviderModule, ProviderService } from 'provider';
import { RegistryService } from './registry.service';

@Module({
  imports: [LoggerModule, ProviderModule],
  providers: [RegistryService, LidoService, ProviderService, ConfigService],
})
export class RegistryModule {}
