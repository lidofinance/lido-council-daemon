import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@nestjs/common';
import { LoggerModule } from 'common/logger';
import { ConfigModule } from 'common/config';
import { MockProviderModule } from 'provider';
import { KafkaTransport } from './kafka.transport';
import { Kafka, logLevel } from 'kafkajs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MessageType } from '../../messages';

const waitFor = async (cb: () => boolean) => {
  return new Promise((res) => {
    const interval = setInterval(() => {
      if (!cb()) return;
      clearInterval(interval);
      res(true);
    }, 1000);
  });
};

describe('KafkaTransport', () => {
  let transport: KafkaTransport;
  let moduleRef: TestingModule;
  let loggerService: LoggerService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
      ],
      providers: [
        KafkaTransport,
        {
          provide: Kafka,
          useFactory: async () =>
            new Kafka({
              logLevel: logLevel.DEBUG,
              clientId: 'test-client',
              brokers: ['localhost:9092'],
              logCreator: () => () => void 0,
            }),
        },
      ],
    }).compile();

    transport = moduleRef.get(KafkaTransport);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    transport = moduleRef.get(KafkaTransport);
    await transport.disconnect();
  });

  describe('pubsub', () => {
    it('should send two messages to topic and read two messages from topic', async () => {
      const receivedMessages: any[] = [];

      await transport.subscribe('test', MessageType.PING, async (msg) => {
        receivedMessages.push(msg);
      });

      await transport.publish('test', { label: 'first' }, MessageType.PING);
      await transport.publish('test', { label: 'second' }, MessageType.PING);

      await waitFor(() => receivedMessages.length > 1);

      expect(receivedMessages.length).toBe(2);
      expect(receivedMessages[0]).toHaveProperty('label');
      expect(receivedMessages[0].label).toBe('first');
      expect(receivedMessages[1]).toHaveProperty('label');
      expect(receivedMessages[1].label).toBe('second');
    }, 60_000);
  });
});
