import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { getNetwork } from '@ethersproject/networks';
import { MockProviderModule } from 'provider';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { MessagesService } from './messages.service';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { TransportInterface } from 'transport';
import { PrometheusModule } from 'common/prometheus';

jest.mock('../transport/stomp/stomp.client');

describe('MessagesService', () => {
  let provider: SimpleFallbackJsonRpcBatchProvider;
  let messagesService: MessagesService;
  let transportService: TransportInterface;

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
  });

  describe('getMessageTopic', () => {
    it('should return topic for mainnet', async () => {
      jest
        .spyOn(provider, 'getNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const topic = await messagesService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return topic for goerli', async () => {
      jest
        .spyOn(provider, 'getNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

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
      expect(mockPublish).toBeCalledWith(
        expectedTopic,
        expectedMessage,
        undefined,
      );
    });
  });
});
