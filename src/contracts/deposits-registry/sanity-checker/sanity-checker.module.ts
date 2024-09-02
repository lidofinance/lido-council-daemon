import { Module } from '@nestjs/common';
import { BlockchainCheckerModule } from './blockchain-checker';
import { DepositIntegrityCheckerModule } from './integrity-checker';
import { DepositRegistrySanityCheckerService } from './sanity-checker.service';

@Module({
  imports: [BlockchainCheckerModule, DepositIntegrityCheckerModule],
  providers: [DepositRegistrySanityCheckerService],
  exports: [DepositRegistrySanityCheckerService],
})
export class DepositRegistrySanityCheckerModule {}
