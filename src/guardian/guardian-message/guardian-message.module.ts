import { Module } from '@nestjs/common';
import { MessagesModule } from 'messages';
import { GuardianMessageService } from './guardian-message.service';

@Module({
  imports: [MessagesModule],
  providers: [GuardianMessageService],
  exports: [GuardianMessageService],
})
export class GuardianMessageModule {}
