import { Module } from '@nestjs/common';
import { SecurityModule } from 'security';
import { ProviderModule } from 'provider';
import { DepositService } from './deposit.service';
import { DepositCacheService } from './cache.service';

@Module({
  imports: [SecurityModule, ProviderModule],
  providers: [DepositService, DepositCacheService],
  exports: [DepositService],
})
export class DepositModule {}
