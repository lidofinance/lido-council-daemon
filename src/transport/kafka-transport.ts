import { TransportInterface } from './transport.interface';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KafkaTransport implements TransportInterface {
  private readonly logger = new Logger(KafkaTransport.name);

  protected kafka: Kafka;
  protected consumers: { [topic: string]: Consumer } = {};
  protected producer: Producer;

  public constructor(config: ConfigService) {
    this.kafka = new Kafka({
      clientId: config.get<string>('COUNCIL_ID'),
      brokers: [config.get<string>('KAFKA_BROKER_1')],
      logCreator: () => {
        return (logEntry) => this.logger.log(logEntry);
      },
    });

    this.producer = this.kafka.producer();
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
    if (!this.consumers[topic]) {
      this.consumers[topic] = this.kafka.consumer({
        groupId: `${topic}-group`,
      });
      await this.consumers[topic].connect();
      await this.consumers[topic].subscribe({ topic, fromBeginning: false });

      await this.consumers[topic].run({
        eachMessage: async ({ topic, partition, message }) => {
          this.logger.debug(`Received message [${topic}] [${partition}]`);
          const data = this.safeJsonParse(message.value.toString());

          if (data) {
            await cb(data);
          }
        },
      });
    }
  }

  protected safeJsonParse(str: string): any | void {
    try {
      return JSON.parse(str);
    } catch (e) {}

    return undefined;
  }
}
