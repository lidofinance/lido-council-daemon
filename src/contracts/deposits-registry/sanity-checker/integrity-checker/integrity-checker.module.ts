import { Module } from '@nestjs/common';
import { DepositIntegrityCheckerService } from './integrity-checker.service';

@Module({
  providers: [DepositIntegrityCheckerService],
  exports: [DepositIntegrityCheckerService],
})
export class DepositIntegrityCheckerModule {}
