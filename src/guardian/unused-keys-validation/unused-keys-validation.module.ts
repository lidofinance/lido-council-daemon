import { Module } from '@nestjs/common';
import { UnusedKeysValidationService } from './unused-keys-validation.service';
import { BlsModule } from 'bls';

@Module({
  imports: [BlsModule],
  providers: [UnusedKeysValidationService],
  exports: [UnusedKeysValidationService],
})
export class UnusedKeysValidationModule {}
