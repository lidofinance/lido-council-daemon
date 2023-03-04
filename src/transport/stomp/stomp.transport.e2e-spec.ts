import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { sleep } from 'utils';
import { MessageType } from '../../messages';
import StompTransport from './stomp.transport';
import StompClient from './stomp.client';

describe('StompTransport', () => {
  let transport: StompTransport;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), LoggerModule],
      providers: [
        StompTransport,
        {
          provide: StompClient,
          useFactory: async () => {
            return new StompClient(
              'ws://127.0.0.1:15674/ws',
              'guest', // lgtm[js/hardcoded-credentials]
              'guest', // lgtm[js/hardcoded-credentials]
              () => void 0,
              () => void 0,
            );
          },
        },
      ],
    }).compile();

    transport = moduleRef.get(StompTransport);
  });

  afterEach(async () => {
    transport = moduleRef.get(StompTransport);
    await transport.disconnect();
  });

  describe('pubsub', () => {
    it('should send two messages to topic and read two messages from topic', async () => {
      const receivedMessages: any[] = [];

      await sleep(2000);

      await transport.subscribe('amq.direct', MessageType.PING, async (msg) => {
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

      await sleep(2000);

      expect(receivedMessages.length).toBe(2);
      expect(receivedMessages[0]).toHaveProperty('label');
      expect(receivedMessages[0].label).toBe('first');
      expect(receivedMessages[1]).toHaveProperty('label');
      expect(receivedMessages[1].label).toBe('second');
    }, 20_000);
  });
});
