import { Module } from '@nestjs/common';
import { DepositModule } from 'deposit';
import { ProviderModule } from 'provider';
import { RegistryModule } from 'registry';
import { SecurityModule } from 'security';
import { MessagesModule } from 'messages';
import { GuardianService } from './guardian.service';

@Module({
  imports: [
    RegistryModule,
    DepositModule,
    SecurityModule,
    ProviderModule,
    MessagesModule,
  ],
  providers: [GuardianService],
  exports: [GuardianService],
})
export class GuardianModule {}
