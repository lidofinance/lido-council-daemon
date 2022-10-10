import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { ConfigModule } from 'common/config';
import { MessageType } from '../../messages';
import RabbitTransport from './rabbit.transport';
import RabbitClient from './rabbit.client';
import { FetchService } from '@lido-nestjs/fetch';
import { Logger } from '@nestjs/common/services/logger.service';
import { MiddlewareService } from '@lido-nestjs/middleware';

describe('RabbitTransport', () => {
  let moduleRef: TestingModule;
  let transport: RabbitTransport;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), LoggerModule],
      providers: [
        RabbitTransport,
        {
          provide: RabbitClient,
          useFactory: async () => {
            const rabbitClient = new RabbitClient(
              'http://127.0.0.1:15672/',
              '%2f',
              'guest', // lgtm[js/hardcoded-credentials]
              'guest', // lgtm[js/hardcoded-credentials]
              new Logger(),
              new FetchService(null, new MiddlewareService(undefined)),
            );

            await rabbitClient.createQueue(MessageType.PING);
            await rabbitClient.bindQueueToExchange(
              MessageType.PING,
              'amq.direct',
            );

            return rabbitClient;
          },
        },
      ],
    }).compile();

    transport = moduleRef.get(RabbitTransport);
  });

  afterEach(async () => {
    transport = moduleRef.get(RabbitTransport);
    await transport.disconnect();
  });

  describe('pubsub', () => {
    it('should send two messages to topic and read two messages from topic', async () => {
      const receivedMessages: any[] = [];

      transport.subscribe('amq.direct', MessageType.PING, async (msg) => {
        receivedMessages.push(msg);
      });

      await transport.publish(
        'amq.direct',
        { label: 'first' },
        MessageType.PING,
      );
      await transport.publish(
        'amq.direct',
        { label: 'second' },
        MessageType.PING,
      );

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
