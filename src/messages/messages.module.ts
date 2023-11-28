import { Module } from '@nestjs/common';
import { TransportModule } from 'transport';
import { MessagesService } from './messages.service';

@Module({
  // imports: [TransportModule],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
