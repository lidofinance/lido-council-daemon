import { Module } from '@nestjs/common';
import { KeyValidatorModule } from '@lido-nestjs/key-validation';
import { KeysValidationService } from './keys-validation.service';

@Module({
  imports: [KeyValidatorModule.forFeature({ multithreaded: true })],
  providers: [KeysValidationService],
  exports: [KeysValidationService],
})
export class KeysValidationModule {}
