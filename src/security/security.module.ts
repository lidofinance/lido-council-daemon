import { Module } from '@nestjs/common';
import { ProviderModule } from 'provider';
import { WalletModule } from 'wallet';
import { SecurityService } from './security.service';

@Module({
  imports: [ProviderModule, WalletModule],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
