import { CHAINS } from '@lido-nestjs/constants';
import { Test } from '@nestjs/testing';
import { providers } from 'ethers';
import { MockProviderModule } from 'provider';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { MessagesService } from './messages.service';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { TransportInterface } from 'transport';
import {
  METRIC_PUBLISH_MESSAGE_DURATION,
  PrometheusModule,
} from 'common/prometheus';
import { getToken } from '@willsoto/nestjs-prometheus';
import { Histogram } from '@prometheus-io/client';
import { MessageType } from './interfaces';

describe('MessagesService', () => {
  let provider: SimpleFallbackJsonRpcBatchProvider;
  let messagesService: MessagesService;
  let transportService: TransportInterface;
  let publishDuration: Histogram<string>;

  beforeEach(async () => {
    const mockTransportService = {
      publish: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        PrometheusModule,
        LoggerModule,
      ],
      providers: [
        MessagesService,
        {
          provide: TransportInterface,
          useValue: mockTransportService,
        },
      ],
    }).compile();

    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
    messagesService = moduleRef.get(MessagesService);
    transportService = moduleRef.get(TransportInterface);
    publishDuration = moduleRef.get(getToken(METRIC_PUBLISH_MESSAGE_DURATION));
  });

  describe('getMessageTopic', () => {
    it('should return topic for mainnet', async () => {
      jest
        .spyOn(provider, 'getNetwork')
        .mockImplementation(async () => providers.getNetwork(CHAINS.Mainnet));

      const topic = await messagesService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return topic for goerli', async () => {
      jest
        .spyOn(provider, 'getNetwork')
        .mockImplementation(async () => providers.getNetwork(CHAINS.Goerli));

      const topic = await messagesService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return different topics', async () => {
      jest.restoreAllMocks();

      jest
        .spyOn(provider, 'getNetwork')
        .mockImplementationOnce(async () => ({
          chainId: CHAINS.Mainnet,
          name: 'mainnet',
        }))
        .mockImplementationOnce(async () => ({
          chainId: CHAINS.Goerli,
          name: 'goerli',
        }))
        .mockImplementationOnce(async () => ({
          chainId: CHAINS.Holesky,
          name: 'holesky',
        }));

      const mainnetTopic = await messagesService.getMessageTopic();
      const goerliTopic = await messagesService.getMessageTopic();
      const holeskyTopic = await messagesService.getMessageTopic();

      expect(mainnetTopic).not.toBe(goerliTopic);
      expect(mainnetTopic).not.toBe(holeskyTopic);
    });
  });

  describe('sendMessage', () => {
    it('should send message to transport service', async () => {
      const expectedMessage = {} as any;
      const expectedTopic = 'topic';

      const mockPublish = jest
        .spyOn(transportService, 'publish')
        .mockImplementation(async () => undefined);

      const mockGetTopic = jest
        .spyOn(messagesService, 'getMessageTopic')
        .mockImplementation(async () => expectedTopic);

      await messagesService.sendMessage(expectedMessage);

      expect(mockGetTopic).toHaveBeenCalledTimes(1);
      expect(mockPublish).toHaveBeenCalledTimes(1);
      expect(mockPublish).toHaveBeenCalledWith(
        expectedTopic,
        expectedMessage,
        undefined,
      );
    });

    it('should record the publish time with result=success', async () => {
      const endTimer = jest.fn();
      const startTimer = jest
        .spyOn(publishDuration, 'startTimer')
        .mockReturnValue(endTimer);
      jest.spyOn(messagesService, 'getMessageTopic').mockResolvedValue('topic');
      jest.spyOn(transportService, 'publish').mockResolvedValue(undefined);

      await messagesService.sendMessage({ type: MessageType.PAUSE } as any);

      expect(startTimer).toHaveBeenCalledWith({ messageType: 'pause' });
      expect(endTimer).toHaveBeenCalledTimes(1);
      expect(endTimer).toHaveBeenCalledWith({ result: 'success' });
    });

    it('should record the publish time with result=fail and rethrow', async () => {
      const endTimer = jest.fn();
      jest.spyOn(publishDuration, 'startTimer').mockReturnValue(endTimer);
      jest.spyOn(messagesService, 'getMessageTopic').mockResolvedValue('topic');
      jest
        .spyOn(transportService, 'publish')
        .mockRejectedValue(new Error('no receipt'));
      const inc = jest.spyOn(messagesService.messageCounter, 'labels');

      await expect(
        messagesService.sendMessage({ type: MessageType.DEPOSIT } as any),
      ).rejects.toThrow('no receipt');

      expect(endTimer).toHaveBeenCalledTimes(1);
      expect(endTimer).toHaveBeenCalledWith({ result: 'fail' });
      expect(inc).not.toHaveBeenCalled();
    });
  });
});
