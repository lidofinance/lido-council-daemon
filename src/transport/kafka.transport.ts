import { TransportInterface } from './transport.interface';
import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { KAFKA_LOG_PREFIX } from './kafka.constants';

@Injectable()
export class KafkaTransport implements TransportInterface {
  protected kafka: Kafka;
  protected consumers: { [topic: string]: Consumer } = {};
  protected producer: Producer;

  public constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private configService: ConfigService,
  ) {
    this.kafka = new Kafka({
      clientId: this.configService.get<string>('COUNCIL_ID'),
      brokers: [this.configService.get<string>('KAFKA_BROKER_1')],
      sasl: {
        mechanism: 'plain',
        username: configService.get('KAFKA_USERNAME'),
        password: configService.get('KAFKA_PASSWORD'),
      },
      logCreator: () => {
        return ({ log, level }) => {
          const prefix = KAFKA_LOG_PREFIX;
          if (level === logLevel.ERROR) this.logger.error(prefix, log);
          if (level === logLevel.WARN) this.logger.warn(prefix, log);
          if (level === logLevel.INFO) this.logger.log(prefix, log);
          if (level === logLevel.DEBUG) this.logger.debug(prefix, log);
        };
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
