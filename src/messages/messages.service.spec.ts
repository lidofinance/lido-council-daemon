import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { getNetwork } from '@ethersproject/networks';
import { MockProviderModule, ProviderService } from 'provider';
import { MessagesService } from './messages.service';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { TransportInterface } from 'transport';
import { PrometheusModule } from 'common/prometheus';
import { MessagesModule } from 'messages';

jest.mock('../transport/stomp/stomp.client');

describe('MessagesService', () => {
  let providerService: ProviderService;
  let messagesService: MessagesService;
  let transportService: TransportInterface;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        PrometheusModule,
        LoggerModule,
        MessagesModule,
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    messagesService = moduleRef.get(MessagesService);
    transportService = moduleRef.get(TransportInterface);
  });

  describe('getMessageTopic', () => {
    it('should return topic for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const topic = await messagesService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return topic for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const topic = await messagesService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return different topics', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => CHAINS.Mainnet)
        .mockImplementationOnce(async () => CHAINS.Goerli)
        .mockImplementationOnce(async () => CHAINS.Holesky);

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

      expect(mockGetTopic).toBeCalledTimes(1);
      expect(mockPublish).toBeCalledTimes(1);
      expect(mockPublish).toBeCalledWith(
        expectedTopic,
        expectedMessage,
        undefined,
      );
    });
  });
});
