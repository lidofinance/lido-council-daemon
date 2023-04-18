import { Module } from '@nestjs/common';
import { DepositModule } from 'contracts/deposit';
import { SecurityModule } from 'contracts/security';
import { BlockGuardService } from './block-guard.service';

@Module({
  imports: [DepositModule, SecurityModule],
  providers: [BlockGuardService],
  exports: [BlockGuardService],
})
export class BlockGuardModule {}
