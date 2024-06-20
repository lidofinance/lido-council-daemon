import { Module } from '@nestjs/common';
import { SigningKeyEventsCacheModule } from 'contracts/signing-key-events-cache';
import { KeysDuplicationCheckerService } from './keys-duplication-checker.service';

@Module({
  imports: [SigningKeyEventsCacheModule],
  providers: [KeysDuplicationCheckerService],
  exports: [KeysDuplicationCheckerService],
})
export class KeysDuplicationCheckerModule {}
