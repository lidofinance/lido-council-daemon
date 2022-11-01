import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { MessageType } from '../../messages';
import StompTransport from './stomp.transport';
import StompClient from './stomp.client';

describe('StompTransport', () => {
  let transport: StompTransport;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        StompTransport,
        {
          provide: StompClient,
          useFactory: async () => {
            return new StompClient(
              'ws://127.0.0.1:15674/ws',
              'guest', // lgtm[js/hardcoded-credentials]
              'guest', // lgtm[js/hardcoded-credentials]
              // eslint-disable-next-line @typescript-eslint/no-empty-function
              () => {},
              // eslint-disable-next-line @typescript-eslint/no-empty-function
              () => {},
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

      await new Promise<void>(async (resolve) => {
        setTimeout(resolve, 1000);
      });

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

      await new Promise<void>(async (resolve) => {
        setTimeout(resolve, 2000);
      });

      expect(receivedMessages.length).toBe(2);
      expect(receivedMessages[0]).toHaveProperty('label');
      expect(receivedMessages[0].label).toBe('first');
      expect(receivedMessages[1]).toHaveProperty('label');
      expect(receivedMessages[1].label).toBe('second');
    });
  });
});
