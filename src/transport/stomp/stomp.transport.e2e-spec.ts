import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { sleep } from 'utils';
import { MessageType } from '../../messages';
import StompTransport from './stomp.transport';
import StompClient from './stomp.client';
import { STOMP_OPTIONS } from 'transport/transport.constants';

describe.skip('StompTransport', () => {
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
            const stomp = new StompClient({
              url: 'ws://127.0.0.1:15674/ws',
              login: 'guest', // lgtm[js/hardcoded-credentials]
              passcode: 'guest', // lgtm[js/hardcoded-credentials]
              connectCallback: () => void 0,
              errorCallback: () => void 0,
              options: STOMP_OPTIONS,
            });

            stomp.connect().catch((error) => {
              console.error(error);
            });
            return stomp;
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

      await transport.subscribe('amq.direct', MessageType.PING, async (msg) => {
        receivedMessages.push(msg);
      });

      await sleep(2000);

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
