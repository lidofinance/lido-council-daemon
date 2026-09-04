import { Module } from '@nestjs/common';
import { BlockchainCheckerModule } from './blockchain-checker';
import { DepositIntegrityCheckerModule } from './integrity-checker';
import { DepositRegistrySanityCheckerService } from './sanity-checker.service';
import {
  ConsecutiveFreshDepositRootMismatchesProvider,
  FreshDepositRootMismatchesProvider,
} from './sanity-checker.metrics';

@Module({
  imports: [BlockchainCheckerModule, DepositIntegrityCheckerModule],
  providers: [
    DepositRegistrySanityCheckerService,
    FreshDepositRootMismatchesProvider,
    ConsecutiveFreshDepositRootMismatchesProvider,
  ],
  exports: [DepositRegistrySanityCheckerService],
})
export class DepositRegistrySanityCheckerModule {}
