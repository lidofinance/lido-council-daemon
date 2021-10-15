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
        .mockImplementation(() => undefined as any);

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

  describe('isSameContractsState', () => {
    it('should return false if previous state is empty', () => {
      const isSame = defenderService.isSameContractsState(1, '0x1');
      expect(isSame).toBe(false);
    });

    it('should return true if state is the same', () => {
      const args = [1, '0x1'] as const;
      const firstCall = defenderService.isSameContractsState(...args);
      const secondCall = defenderService.isSameContractsState(...args);

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(true);
    });

    it('should return false if keysOpIndex is changed', () => {
      const firstCall = defenderService.isSameContractsState(1, '0x1');
      const secondCall = defenderService.isSameContractsState(2, '0x1');

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(false);
    });

    it('should return false if depositRoot is changed', () => {
      const firstCall = defenderService.isSameContractsState(1, '0x1');
      const secondCall = defenderService.isSameContractsState(1, '0x2');

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(false);
    });
  });

  describe('isSameDepositResigningIndex', () => {
    it('should return false if previous state is empty', async () => {
      jest
        .spyOn(defenderService, 'getDepositResigningIndex')
        .mockImplementationOnce(async () => 1);

      const isSame = await defenderService.isSameDepositResigningIndex();
      expect(isSame).toBe(false);
    });

    it('should return true if state is the same', async () => {
      jest
        .spyOn(defenderService, 'getDepositResigningIndex')
        .mockImplementationOnce(async () => 1)
        .mockImplementationOnce(async () => 1);

      const firstCall = await defenderService.isSameDepositResigningIndex();
      const secondCall = await defenderService.isSameDepositResigningIndex();

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(true);
    });

    it('should return false if depositResigningIndex is changed', async () => {
      jest
        .spyOn(defenderService, 'getDepositResigningIndex')
        .mockImplementationOnce(async () => 1)
        .mockImplementationOnce(async () => 2);

      const firstCall = await defenderService.isSameDepositResigningIndex();
      const secondCall = await defenderService.isSameDepositResigningIndex();

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(false);
    });
  });

  describe('isSamePauseResigningIndex', () => {
    it('should return false if previous state is empty', async () => {
      jest
        .spyOn(defenderService, 'getPauseResigningIndex')
        .mockImplementationOnce(async () => 1);

      const isSame = await defenderService.isSamePauseResigningIndex();
      expect(isSame).toBe(false);
    });

    it('should return true if state is the same', async () => {
      jest
        .spyOn(defenderService, 'getPauseResigningIndex')
        .mockImplementationOnce(async () => 1)
        .mockImplementationOnce(async () => 1);

      const firstCall = await defenderService.isSamePauseResigningIndex();
      const secondCall = await defenderService.isSamePauseResigningIndex();

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(true);
    });

    it('should return false if pauseResigningIndex is changed', async () => {
      jest
        .spyOn(defenderService, 'getPauseResigningIndex')
        .mockImplementationOnce(async () => 1)
        .mockImplementationOnce(async () => 2);

      const firstCall = await defenderService.isSamePauseResigningIndex();
      const secondCall = await defenderService.isSamePauseResigningIndex();

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
        .spyOn(defenderService, 'getDepositResigningIndex')
        .mockImplementation(async () => 1);

      jest
        .spyOn(defenderService, 'getPauseResigningIndex')
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
        .spyOn(defenderService, 'isSameContractsState')
        .mockImplementation(() => true);

      const mockIsSameDepositResigningIndex = jest
        .spyOn(defenderService, 'isSameDepositResigningIndex')
        .mockImplementation(async () => true);

      const mockGetNextKeys = jest
        .spyOn(registryService, 'getNextKeys')
        .mockImplementation(async () => []);

      await Promise.all([
        defenderService.protectPubKeys(),
        defenderService.protectPubKeys(),
      ]);

      expect(mockGetNextKeys).toBeCalledTimes(1);
      expect(mockIsSameState).toBeCalledTimes(1);
      expect(mockIsSameDepositResigningIndex).toBeCalledTimes(1);
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

  describe('getDepositResigningIndex', () => {
    it('should return the same value for near block', async () => {
      const providerCall = jest
        .spyOn(providerService, 'getBlockNumber')
        .mockImplementationOnce(async () => 101)
        .mockImplementationOnce(async () => 102);

      const firstIndex = await defenderService.getDepositResigningIndex();
      const secondIndex = await defenderService.getDepositResigningIndex();
      expect(firstIndex).toBe(secondIndex);
      expect(providerCall).toBeCalledTimes(2);
    });

    it('should return the unique value for far block', async () => {
      const providerCall = jest
        .spyOn(providerService, 'getBlockNumber')
        .mockImplementationOnce(async () => 101)
        .mockImplementationOnce(async () => 301);

      const firstIndex = await defenderService.getDepositResigningIndex();
      const secondIndex = await defenderService.getDepositResigningIndex();
      expect(firstIndex).not.toBe(secondIndex);
      expect(providerCall).toBeCalledTimes(2);
    });
  });

  describe('getPauseResigningIndex', () => {
    it('should return the same value for near block', async () => {
      const providerCall = jest
        .spyOn(providerService, 'getBlockNumber')
        .mockImplementationOnce(async () => 101)
        .mockImplementationOnce(async () => 102);

      const firstIndex = await defenderService.getPauseResigningIndex();
      const secondIndex = await defenderService.getPauseResigningIndex();
      expect(firstIndex).toBe(secondIndex);
      expect(providerCall).toBeCalledTimes(2);
    });

    it('should return the unique value for far block', async () => {
      const providerCall = jest
        .spyOn(providerService, 'getBlockNumber')
        .mockImplementationOnce(async () => 101)
        .mockImplementationOnce(async () => 301);

      const firstIndex = await defenderService.getPauseResigningIndex();
      const secondIndex = await defenderService.getPauseResigningIndex();
      expect(firstIndex).not.toBe(secondIndex);
      expect(providerCall).toBeCalledTimes(2);
    });
  });
});