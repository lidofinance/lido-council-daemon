import { Module } from '@nestjs/common';
import { LidoModule } from 'lido';
import { ProviderModule } from 'provider';
import { DepositService } from './deposit.service';
import { DepositCacheService } from './cache.service';

@Module({
  imports: [LidoModule, ProviderModule],
  providers: [DepositService, DepositCacheService],
  exports: [DepositService],
})
export class DepositModule {}
