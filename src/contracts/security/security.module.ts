import { Module } from '@nestjs/common';
import { WalletModule } from 'wallet';
import { SecurityService } from './security.service';

@Module({
  imports: [WalletModule],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
