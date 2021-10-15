import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { ProviderModule, ProviderService } from 'provider';
import { GuardianService } from './guardian.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { TransportInterface, TransportModule } from 'transport';
import { RegistryModule, RegistryService } from 'registry';
import { DepositModule, DepositService } from 'deposit';
import { SecurityModule } from 'security';

describe('GuardianService', () => {
  let providerService: ProviderService;
  let depositService: DepositService;
  let guardianService: GuardianService;
  let registryService: RegistryService;
  let transportService: TransportInterface;
  let loggerService: LoggerService;

  beforeEach(async () => {
    class MockRpcProvider extends JsonRpcProvider {
      async _uncachedDetectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        LoggerModule,
        ProviderModule,
        RegistryModule,
        DepositModule,
        SecurityModule,
        TransportModule,
      ],
      providers: [GuardianService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    providerService = moduleRef.get(ProviderService);
    guardianService = moduleRef.get(GuardianService);
    depositService = moduleRef.get(DepositService);
    registryService = moduleRef.get(RegistryService);
    transportService = moduleRef.get(TransportInterface);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);
  });

  describe('onModuleInit', () => {
    it.todo('should init deposit service');
    it.todo('should subscribe to updates');
  });

  describe('subscribeToEthereumUpdates', () => {
    it('should subscribe to updates', () => {
      const mockOn = jest
        .spyOn(providerService.provider, 'on')
        .mockImplementation(() => undefined as any);

      guardianService.subscribeToEthereumUpdates();
      expect(mockOn).toBeCalledTimes(1);
      expect(mockOn).toBeCalledWith('block', expect.any(Function));
    });
  });

  describe('getKeysIntersections', () => {
    it('should find the keys when they match', () => {
      const nextLidoKeys = ['0x1'];
      const depositedKeys = new Set(['0x1']);
      const matched = guardianService.getKeysIntersections(
        nextLidoKeys,
        depositedKeys,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(1);
      expect(matched).toContain('0x1');
    });

    it('should not find the keys when they don’t match', () => {
      const nextLidoKeys = ['0x2'];
      const depositedKeys = new Set(['0x1']);
      const matched = guardianService.getKeysIntersections(
        nextLidoKeys,
        depositedKeys,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });

    it('should work if array is empty', () => {
      const nextLidoKeys = [];
      const depositedKeys = new Set(['0x1']);
      const matched = guardianService.getKeysIntersections(
        nextLidoKeys,
        depositedKeys,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });
  });

  describe('checkKeysIntersections', () => {
    const depositedKeys = ['0x1234', '0x5678'];

    beforeEach(async () => {
      jest
        .spyOn(guardianService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      jest
        .spyOn(depositService, 'getAllDepositedPubKeys')
        .mockImplementation(async () => new Set(depositedKeys));
    });

    it('should call handleKeysIntersections if Lido unused key is found in the deposit contract', async () => {
      const existedKey = depositedKeys[0];

      const handleCorrectKeys = jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const handleKeysIntersections = jest
        .spyOn(guardianService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      const mockGetNextSigningKeys = jest
        .spyOn(registryService, 'getNextSigningKeys')
        .mockImplementation(async () => [existedKey]);

      await guardianService.checkKeysIntersections();

      expect(mockGetNextSigningKeys).toBeCalledTimes(1);
      expect(handleCorrectKeys).not.toBeCalled();

      expect(handleKeysIntersections).toBeCalledTimes(1);
      expect(handleKeysIntersections).toBeCalledWith();
    });

    it('should call handleCorrectKeys if Lido unused key are not found in the deposit contract', async () => {
      const notDepositedKey = '0x2345';

      const handleCorrectKeys = jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const handleKeysIntersections = jest
        .spyOn(guardianService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      const mockGetNextSigningKeys = jest
        .spyOn(registryService, 'getNextSigningKeys')
        .mockImplementation(async () => [notDepositedKey]);

      await guardianService.checkKeysIntersections();

      expect(mockGetNextSigningKeys).toBeCalledTimes(1);
      expect(handleKeysIntersections).not.toBeCalled();

      expect(handleCorrectKeys).toBeCalledTimes(1);
      expect(handleCorrectKeys).toBeCalledWith();
    });

    it('should exit if the previous call is not completed', async () => {
      jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockGetNextSigningKeys = jest
        .spyOn(registryService, 'getNextSigningKeys')
        .mockImplementation(async () => []);

      await Promise.all([
        guardianService.checkKeysIntersections(),
        guardianService.checkKeysIntersections(),
      ]);

      expect(mockGetNextSigningKeys).toBeCalledTimes(1);
    });

    it.todo(
      'should exit if it’s the same contracts state and the same resigning deposit index',
    );

    it.todo(
      'should exit if it’s the same contracts state and the same resigning pause index',
    );
  });

  describe('getMessageTopic', () => {
    it('should return topic for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const topic = await guardianService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return topic for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const topic = await guardianService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return different topics', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => CHAINS.Mainnet)
        .mockImplementationOnce(async () => CHAINS.Goerli);

      const mainnetTopic = await guardianService.getMessageTopic();
      const goerliTopic = await guardianService.getMessageTopic();

      expect(mainnetTopic).not.toBe(goerliTopic);
    });
  });

  describe('sendMessage', () => {
    it('should send message to transport service', async () => {
      const expectedMessage = 'message';
      const expectedTopic = 'topic';

      const mockPublish = jest
        .spyOn(transportService, 'publish')
        .mockImplementation(async () => undefined);

      const mockGetTopic = jest
        .spyOn(guardianService, 'getMessageTopic')
        .mockImplementation(async () => expectedTopic);

      await guardianService.sendMessage(expectedMessage);

      expect(mockGetTopic).toBeCalledTimes(1);
      expect(mockPublish).toBeCalledTimes(1);
      expect(mockPublish).toBeCalledWith(expectedTopic, expectedMessage);
    });
  });

  describe('isSameContractsStates', () => {
    it.todo('should return true if states are the same');
    it.todo('should return true if blockNumbers are close');
    it.todo('should return false if blockNumbers are too far');
    it.todo('should return false if depositRoot are different');
    it.todo('should return false if keysOpIndex are different');
  });

  describe('handleCorrectKeys', () => {
    it.todo('should check contracts state');
    it.todo('should exit if contracts state is the same');
    it.todo('should send deposit message');
  });

  describe('handleKeysIntersections', () => {
    it.todo('should pause deposits');
    it.todo('should send pause message');
  });
});
