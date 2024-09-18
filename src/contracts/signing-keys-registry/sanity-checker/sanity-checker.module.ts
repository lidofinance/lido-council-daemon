import { Module } from '@nestjs/common';
import { SigningKeysRegistrySanityCheckerService } from './sanity-checker.service';

@Module({
  providers: [SigningKeysRegistrySanityCheckerService],
  exports: [SigningKeysRegistrySanityCheckerService],
})
export class SigningKeysRegistrySanityCheckerModule {}
