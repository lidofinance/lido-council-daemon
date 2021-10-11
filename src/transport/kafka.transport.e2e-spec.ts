import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from '../common/logger';
import { KafkaTransport } from './kafka.transport';
import { Kafka, logLevel } from 'kafkajs';

describe('KafkaTransport', () => {
  let transport: KafkaTransport;
  let kafka: Kafka;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [LoggerModule],
      providers: [
        KafkaTransport,
        {
          provide: Kafka,
          useFactory: async () =>
            new Kafka({
              clientId: 'test-client',
              brokers: ['localhost:9092'],
              logCreator: (logLevel) => (entry) => void 0,
            }),
        },
      ],
    }).compile();

    transport = moduleRef.get(KafkaTransport);
  });

  afterEach(async () => {
    transport = moduleRef.get(KafkaTransport);
    await transport.disconnect();
  });

  describe('pubsub', () => {
    it('should send two messages to topic and read two messages from topic', async () => {
      const receivedMessages = [];

      await transport.publish('test', { label: 'first' });
      await transport.publish('test', { label: 'second' });

      await transport.subscribe('test', async (msg) => {
        receivedMessages.push(msg);
      });

      await new Promise<void>(async (resolve) => {
        setTimeout(resolve, 3000);
      });

      expect(receivedMessages.length).toBe(2);
      expect(receivedMessages[0]).toHaveProperty('label');
      expect(receivedMessages[0].label).toBe('first');
      expect(receivedMessages[1]).toHaveProperty('label');
      expect(receivedMessages[1].label).toBe('second');
    });
  });
});

//
//
