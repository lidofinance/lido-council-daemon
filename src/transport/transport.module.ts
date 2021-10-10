import { Module } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { TransportInterface } from './transport.interface';
import { KafkaTransport } from './kafka.transport';

@Module({
  imports: [ConfigModule],
  exports: [TransportInterface],
  providers: [
    {
      provide: TransportInterface,
      useClass: KafkaTransport,
    },
  ],
})
export class TransportModule {}
