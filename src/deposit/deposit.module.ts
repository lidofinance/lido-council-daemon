import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'common/logger';
import { DepositCacheService } from 'deposit';
import { LidoService } from 'lido';
import { ProviderService } from 'provider';
import { RegistryService } from 'registry';
import { DepositService } from './deposit.service';

@Module({
  imports: [LoggerModule],
  providers: [
    DepositService,
    ProviderService,
    ConfigService,
    LidoService,
    RegistryService,
    DepositCacheService,
  ],
})
export class DepositModule {}
