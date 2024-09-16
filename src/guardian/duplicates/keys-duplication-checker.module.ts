import { Module } from '@nestjs/common';
import { SigningKeysRegistryModule } from 'contracts/signing-keys-registry';
import { KeysDuplicationCheckerService } from './keys-duplication-checker.service';

@Module({
  imports: [SigningKeysRegistryModule],
  providers: [KeysDuplicationCheckerService],
  exports: [KeysDuplicationCheckerService],
})
export class KeysDuplicationCheckerModule {}
