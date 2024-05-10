import { Module } from '@nestjs/common';
import { SecurityModule } from 'contracts/security';
import { LevelDBModule } from './leveldb';
import { BlsModule } from 'bls';
import { DepositService } from './deposit.service';
import { DEPOSIT_CACHE_DEFAULT } from './deposit.constants';
import { DepositIntegrityCheckerService } from './integrity-checker';

@Module({
  imports: [
    BlsModule,
    SecurityModule,
    LevelDBModule.register(DEPOSIT_CACHE_DEFAULT),
  ],
  providers: [DepositService, DepositIntegrityCheckerService],
  exports: [DepositService],
})
export class DepositModule {}
