import { Module } from '@nestjs/common';
import { SecurityModule } from 'contracts/security';
import { UnvettingService } from './unvetting.service';
import { GuardianMessageModule } from 'guardian/guardian-message';

@Module({
  imports: [SecurityModule, GuardianMessageModule],
  providers: [UnvettingService],
  exports: [UnvettingService],
})
export class UnvettingModule {}
