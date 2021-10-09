import { TransportInterface } from './transport.interface';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class Transport implements TransportInterface {
  protected kafka: Kafka;
  protected consumer: Consumer;
  protected producer: Producer;

  public constructor(config: ConfigService) {
    this.kafka = new Kafka({
      clientId: 'council',
      brokers: [config.get<string>('KAFKA_BROKER_1')],
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: 'test-group' });
  }

  public async publish<T>(topic: string, message: T): Promise<void> {
    await this.producer.connect();
    await this.producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify(message),
        },
      ],
    });
  }

  public async subscribe<T>(
    topic: string,
    cb: (message: T) => Promise<void>,
  ): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await cb(JSON.parse(message.value.toString()));

        console.log({
          partition,
          offset: message.offset,
          value: message.value.toString(),
        });
      },
    });
  }
}
