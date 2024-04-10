import { Module } from '@nestjs/common';
import { SecurityModule } from 'contracts/security';
import { CacheModule } from 'cache';
import { BlsModule } from 'bls';
import { DepositService } from './deposit.service';
import {
  DEPOSIT_CACHE_BATCH_SIZE,
  DEPOSIT_CACHE_DEFAULT,
  DEPOSIT_CACHE_FILE_NAME,
} from './deposit.constants';
import { DepositIntegrityCheckerService } from './integrity-checker.service';

@Module({
  imports: [
    BlsModule,
    SecurityModule,
    CacheModule.register(
      DEPOSIT_CACHE_FILE_NAME,
      DEPOSIT_CACHE_BATCH_SIZE,
      DEPOSIT_CACHE_DEFAULT,
    ),
  ],
  providers: [DepositService, DepositIntegrityCheckerService],
  exports: [DepositService],
})
export class DepositModule {}
