import { Module } from '@nestjs/common';
import { SecurityModule } from 'contracts/security';
import { CacheModule } from 'cache';
import { DepositService } from './deposit.service';
import {
  DEPOSIT_CACHE_DEFAULT,
  DEPOSIT_CACHE_FILE_NAME,
} from './deposit.constants';

@Module({
  imports: [
    SecurityModule,
    CacheModule.register(DEPOSIT_CACHE_FILE_NAME, DEPOSIT_CACHE_DEFAULT),
  ],
  providers: [DepositService],
  exports: [DepositService],
})
export class DepositModule {}
