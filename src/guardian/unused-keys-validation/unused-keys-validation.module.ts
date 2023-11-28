import { Module } from '@nestjs/common';
import { UnusedKeysValidationService } from './unused-keys-validation.service';
import { BlsModule } from 'bls';
import { MultithreadedUnusedKeysValidationService } from './multithread-keys-validation.service';

@Module({
  imports: [BlsModule],
  providers: [
    UnusedKeysValidationService,
    MultithreadedUnusedKeysValidationService,
  ],
  exports: [
    UnusedKeysValidationService,
    MultithreadedUnusedKeysValidationService,
  ],
})
export class UnusedKeysValidationModule {}
