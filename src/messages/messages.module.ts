import { Module } from '@nestjs/common';
import { ProviderModule } from 'provider';
import { TransportModule } from 'transport';
import { MessagesService } from './messages.service';

@Module({
  imports: [TransportModule, ProviderModule],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
