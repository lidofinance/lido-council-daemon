import { Module } from '@nestjs/common';
import { BlockchainCheckerService } from './blockchain-checker.service';

@Module({
  providers: [BlockchainCheckerService],
  exports: [BlockchainCheckerService],
})
export class BlockchainCheckerModule {}
