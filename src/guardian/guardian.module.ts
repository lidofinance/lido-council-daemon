import { Module } from '@nestjs/common';
import { DepositModule } from 'contracts/deposit';
import { RegistryModule } from 'contracts/registry';
import { SecurityModule } from 'contracts/security';
import { LidoModule } from 'contracts/lido';
import { MessagesModule } from 'messages';
import { GuardianService } from './guardian.service';

@Module({
  imports: [
    RegistryModule,
    DepositModule,
    SecurityModule,
    LidoModule,
    MessagesModule,
  ],
  providers: [GuardianService],
  exports: [GuardianService],
})
export class GuardianModule {}
