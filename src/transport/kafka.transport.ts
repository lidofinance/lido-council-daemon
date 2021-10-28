import { TransportInterface } from './transport.interface';
import { Kafka, Producer, Consumer } from 'kafkajs';
import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { implementationOf } from '../common/di/decorators/implementationOf';

@Injectable()
@implementationOf(TransportInterface)
export class KafkaTransport implements TransportInterface, OnModuleInit {
  protected consumers: { [topic: string]: Consumer } = {};
  protected producer: Producer;
  protected producerConnected = false;

  public constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private kafka: Kafka,
  ) {
    this.producer = this.kafka.producer();

    this.producer.on('producer.connect', () => {
      this.producerConnected = true;
      this.logger.log('Producer connected to kafka', 'KafkaTransport');
    });

    this.producer.on('producer.disconnect', () => {
      this.producerConnected = false;
      this.logger.log('Producer disconnected to kafka', 'KafkaTransport');
    });
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async publish<T>(topic: string, message: T): Promise<void> {
    if (!this.producerConnected) {
      await this.producer.connect();
    }
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
          this.logger.debug?.(`Received message [${topic}] [${partition}]`);
          const data = this.safeJsonParse(message.value?.toString());

          if (data) {
            await cb(data);
          }
        },
      });
    }
  }

  public async disconnect() {
    await this.producer.disconnect();
    await Promise.all(
      Object.keys(this.consumers).map((consumerKey) =>
        this.consumers[consumerKey].disconnect(),
      ),
    );
  }

  protected safeJsonParse(str = ''): any | void {
    try {
      return JSON.parse(str);
    } catch (e) {}

    return undefined;
  }
}
