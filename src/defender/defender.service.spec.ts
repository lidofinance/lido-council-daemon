import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { ProviderModule, ProviderService } from 'provider';
import { DefenderService } from './defender.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { TransportInterface, TransportModule } from 'transport';
import { RegistryModule, RegistryService } from 'registry';
import { DepositModule, DepositService } from 'deposit';
import { SecurityModule, SecurityService } from 'security';
import { WALLET_PRIVATE_KEY } from 'wallet';
import { Wallet } from '@ethersproject/wallet';

describe('DefenderService', () => {
  const wallet = Wallet.createRandom();

  let providerService: ProviderService;
  let depositService: DepositService;
  let defenderService: DefenderService;
  let registryService: RegistryService;
  let securityService: SecurityService;
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
      providers: [DefenderService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .overrideProvider(WALLET_PRIVATE_KEY)
      .useValue(wallet.privateKey)
      .compile();

    providerService = moduleRef.get(ProviderService);
    defenderService = moduleRef.get(DefenderService);
    depositService = moduleRef.get(DepositService);
    registryService = moduleRef.get(RegistryService);
    securityService = moduleRef.get(SecurityService);
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
        .mockImplementation(() => undefined);

      defenderService.subscribeToEthereumUpdates();
      expect(mockOn).toBeCalledTimes(1);
      expect(mockOn).toBeCalledWith('block', expect.any(Function));
    });
  });

  describe('matchPubKeys', () => {
    it('should find the keys when they match', () => {
      const nextLidoKeys = ['0x1'];
      const depositedKeys = new Set(['0x1']);
      const matched = defenderService.matchPubKeys(nextLidoKeys, depositedKeys);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(1);
      expect(matched).toContain('0x1');
    });

    it('should not find the keys when they don’t match', () => {
      const nextLidoKeys = ['0x2'];
      const depositedKeys = new Set(['0x1']);
      const matched = defenderService.matchPubKeys(nextLidoKeys, depositedKeys);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });

    it('should work if array is empty', () => {
      const nextLidoKeys = [];
      const depositedKeys = new Set(['0x1']);
      const matched = defenderService.matchPubKeys(nextLidoKeys, depositedKeys);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });
  });

  describe('isSameState', () => {
    it('should return false if previous state is empty', () => {
      const isSame = defenderService.isSameState(1, 1, '0x1');
      expect(isSame).toBe(false);
    });

    it('should return true if state is the same', () => {
      const args = [1, 1, '0x1'] as const;
      const firstCall = defenderService.isSameState(...args);
      const secondCall = defenderService.isSameState(...args);

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(true);
    });

    it('should return false if actualStateIndex is changed', () => {
      const firstCall = defenderService.isSameState(1, 1, '0x1');
      const secondCall = defenderService.isSameState(2, 1, '0x1');

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(false);
    });

    it('should return false if keysOpIndex is changed', () => {
      const firstCall = defenderService.isSameState(1, 1, '0x1');
      const secondCall = defenderService.isSameState(1, 2, '0x1');

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(false);
    });

    it('should return false if depositRoot is changed', () => {
      const firstCall = defenderService.isSameState(1, 1, '0x1');
      const secondCall = defenderService.isSameState(1, 1, '0x2');

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(false);
    });
  });

  describe('protectPubKeys', () => {
    const depositRoot = '0x12345678';
    const keysOpIndex = 1;

    beforeEach(async () => {
      jest
        .spyOn(registryService, 'getKeysOpIndex')
        .mockImplementation(async () => keysOpIndex);

      jest
        .spyOn(registryService, 'getActualStateIndex')
        .mockImplementation(async () => 1);

      jest
        .spyOn(depositService, 'getAllPubKeys')
        .mockImplementation(async () => new Set(['0x1234', '0x5678']));

      jest
        .spyOn(depositService, 'getDepositRoot')
        .mockImplementation(async () => depositRoot);
    });

    it('should call handleSuspiciousCase if Lido unused key is found in the deposit contract', async () => {
      const existedKey = '0x1234';

      const mockHandleCorrectCase = jest
        .spyOn(defenderService, 'handleCorrectCase')
        .mockImplementation(async () => undefined);

      const mockHandleSuspiciousCase = jest
        .spyOn(defenderService, 'handleSuspiciousCase')
        .mockImplementation(async () => undefined);

      const mockGetNextKeys = jest
        .spyOn(registryService, 'getNextKeys')
        .mockImplementation(async () => [existedKey]);

      await defenderService.protectPubKeys();

      expect(mockGetNextKeys).toBeCalledTimes(1);
      expect(mockHandleCorrectCase).not.toBeCalled();

      expect(mockHandleSuspiciousCase).toBeCalledTimes(1);
      expect(mockHandleSuspiciousCase).toBeCalledWith();
    });

    it('should call handleCorrectCase if Lido unused key are not found in the deposit contract', async () => {
      const correctKey = '0x2345';

      const mockHandleCorrectCase = jest
        .spyOn(defenderService, 'handleCorrectCase')
        .mockImplementation(async () => undefined);

      const mockHandleSuspiciousCase = jest
        .spyOn(defenderService, 'handleSuspiciousCase')
        .mockImplementation(async () => undefined);

      const mockGetNextKeys = jest
        .spyOn(registryService, 'getNextKeys')
        .mockImplementation(async () => [correctKey]);

      await defenderService.protectPubKeys();

      expect(mockGetNextKeys).toBeCalledTimes(1);
      expect(mockHandleSuspiciousCase).not.toBeCalled();

      expect(mockHandleCorrectCase).toBeCalledTimes(1);
      expect(mockHandleCorrectCase).toBeCalledWith(depositRoot, keysOpIndex);
    });

    it('should exit if the previous call is not completed', async () => {
      const mockIsSameState = jest
        .spyOn(defenderService, 'isSameState')
        .mockImplementation(() => true);

      const mockGetNextKeys = jest
        .spyOn(registryService, 'getNextKeys')
        .mockImplementation(async () => []);

      await Promise.all([
        defenderService.protectPubKeys(),
        defenderService.protectPubKeys(),
      ]);

      expect(mockGetNextKeys).toBeCalledTimes(1);
      expect(mockIsSameState).toBeCalledTimes(1);
    });
  });

  describe('getMessageTopic', () => {
    it('should return topic for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const topic = await defenderService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return topic for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const topic = await defenderService.getMessageTopic();
      expect(typeof topic).toBe('string');
      expect(topic.length).toBeGreaterThan(0);
    });

    it('should return different topics', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => CHAINS.Mainnet)
        .mockImplementationOnce(async () => CHAINS.Goerli);

      const mainnetTopic = await defenderService.getMessageTopic();
      const goerliTopic = await defenderService.getMessageTopic();

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
        .spyOn(defenderService, 'getMessageTopic')
        .mockImplementation(async () => expectedTopic);

      await defenderService.sendMessage(expectedMessage);

      expect(mockGetTopic).toBeCalledTimes(1);
      expect(mockPublish).toBeCalledTimes(1);
      expect(mockPublish).toBeCalledWith(expectedTopic, expectedMessage);
    });
  });

  describe('handleCorrectCase', () => {
    it('should handle case correctly', async () => {
      const expected = {};

      const mockSendMessage = jest
        .spyOn(defenderService, 'sendMessage')
        .mockImplementation(async () => undefined);

      const mockGetDepositData = jest
        .spyOn(securityService, 'getDepositData')
        .mockImplementation(async () => expected as any);

      await defenderService.handleCorrectCase('0x1234', 1);

      expect(mockGetDepositData).toBeCalledTimes(1);
      expect(mockSendMessage).toBeCalledTimes(1);
      expect(mockSendMessage).toBeCalledWith(expected);
    });
  });

  describe('handleSuspiciousCase', () => {
    it('should handle case correctly', async () => {
      const expected = {};

      const mockSendMessage = jest
        .spyOn(defenderService, 'sendMessage')
        .mockImplementation(async () => undefined);

      const mockGetPauseDepositData = jest
        .spyOn(securityService, 'getPauseDepositData')
        .mockImplementation(async () => expected as any);

      const mockPauseDeposits = jest
        .spyOn(securityService, 'pauseDeposits')
        .mockImplementation(async () => undefined);

      await defenderService.handleSuspiciousCase();

      expect(mockGetPauseDepositData).toBeCalledTimes(1);
      expect(mockPauseDeposits).toBeCalledTimes(1);

      expect(mockSendMessage).toBeCalledTimes(1);
      expect(mockSendMessage).toBeCalledWith(expected);
    });
  });
});
