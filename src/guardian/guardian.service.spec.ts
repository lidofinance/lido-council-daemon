import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { ProviderService } from 'provider';
import { GuardianService } from './guardian.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';
import { DepositService } from 'contracts/deposit';
import { RegistryService } from 'contracts/registry';
import { SecurityService } from 'contracts/security';
import { RepositoryModule } from 'contracts/repository';
import { MessagesService, MessageType } from 'messages';

describe('GuardianService', () => {
  let providerService: ProviderService;
  let guardianService: GuardianService;
  let loggerService: LoggerService;
  let depositService: DepositService;
  let registryService: RegistryService;
  let messagesService: MessagesService;
  let securityService: SecurityService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        GuardianModule,
        RepositoryModule,
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    guardianService = moduleRef.get(GuardianService);
    depositService = moduleRef.get(DepositService);
    registryService = moduleRef.get(RegistryService);
    messagesService = moduleRef.get(MessagesService);
    securityService = moduleRef.get(SecurityService);
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

  describe('getNextKeysIntersections', () => {
    it('should find the keys when they match', () => {
      const nextSigningKeys = ['0x1'];
      const depositedKeys = ['0x1'];
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { nextSigningKeys, depositedEvents } as any;
      const matched = guardianService.getNextKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(1);
      expect(matched).toContain('0x1');
    });

    it('should not find the keys when they don’t match', () => {
      const nextSigningKeys = ['0x2'];
      const depositedKeys = ['0x1'];
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { nextSigningKeys, depositedEvents } as any;
      const matched = guardianService.getNextKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });

    it('should work if array is empty', () => {
      const nextSigningKeys = [];
      const depositedKeys = ['0x1'];
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { nextSigningKeys, depositedEvents } as any;
      const matched = guardianService.getNextKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });
  });

  describe('getCachedKeysIntersections', () => {
    const pubkey = '0x1';
    const keysOpIndex = 1;
    const nodeOperatorsCache = {
      keysOpIndex,
      operators: [{ keys: [{ key: pubkey, used: false }] }],
    };
    const depositedKeys = [pubkey];
    const depositedEvents = {
      events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
    };

    it('should find the keys when they match', () => {
      const blockData = {
        keysOpIndex,
        nodeOperatorsCache,
        depositedEvents,
      } as any;
      const matched = guardianService.getCachedKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(1);
      expect(matched).toContain(pubkey);
    });

    it('should not find the keys when they don’t match', () => {
      const blockData = {
        keysOpIndex,
        nodeOperatorsCache,
        depositedEvents: { events: [{ key: '0x2' }] },
      } as any;
      const matched = guardianService.getCachedKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });

    it('should ignore used keys', () => {
      const blockData = {
        keysOpIndex,
        nodeOperatorsCache: {
          ...nodeOperatorsCache,
          operators: [{ keys: [{ key: pubkey, used: true }] }],
        },
        depositedEvents,
      } as any;
      const matched = guardianService.getCachedKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });

    it('should work if events array is empty', () => {
      const blockData = {
        keysOpIndex,
        nodeOperatorsCache,
        depositedEvents: { events: [] },
      } as any;
      const matched = guardianService.getCachedKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });
  });

  describe('getCurrentBlockData', () => {
    it.todo('should collect data from contracts');
  });

  describe('handleNewBlock', () => {
    it('should exit if the previous call is not completed', async () => {
      const blockData = {} as any;

      const mockProviderCall = jest
        .spyOn(providerService, 'getBlock')
        .mockImplementation(async () => ({ number: 1, hash: '0x01' } as any));

      const mockHandleNewBlock = jest
        .spyOn(guardianService, 'checkKeysIntersections')
        .mockImplementation(async () => undefined);

      const mockGetCurrentBlockData = jest
        .spyOn(guardianService, 'getCurrentBlockData')
        .mockImplementation(async () => blockData);

      const mockPingMessageBroker = jest
        .spyOn(guardianService, 'pingMessageBroker')
        .mockImplementation(async () => undefined);

      const mockDepositHandleNewBlock = jest
        .spyOn(depositService, 'handleNewBlock')
        .mockImplementation(async () => undefined);

      const mockRegistryHandleNewBlock = jest
        .spyOn(registryService, 'handleNewBlock')
        .mockImplementation(async () => undefined);

      const mockCollectMetrics = jest
        .spyOn(guardianService, 'collectMetrics')
        .mockImplementation(() => undefined);

      await Promise.all([
        guardianService.handleNewBlock(),
        guardianService.handleNewBlock(),
      ]);

      expect(mockProviderCall).toBeCalledTimes(1);
      expect(mockHandleNewBlock).toBeCalledTimes(1);
      expect(mockGetCurrentBlockData).toBeCalledTimes(1);
      expect(mockDepositHandleNewBlock).toBeCalledTimes(1);
      expect(mockRegistryHandleNewBlock).toBeCalledTimes(1);
      expect(mockPingMessageBroker).toBeCalledTimes(1);
      expect(mockCollectMetrics).toBeCalledTimes(1);
    });
  });

  describe('checkKeysIntersections', () => {
    const depositedPubKeys = ['0x1234', '0x5678'];
    const depositedEvents = {
      startBlock: 1,
      endBlock: 5,
      events: depositedPubKeys.map((pubkey) => ({ pubkey } as any)),
    };
    const nodeOperatorsCache = {
      depositRoot: '0x2345',
      keysOpIndex: 1,
      operators: [],
      version: '1',
    };

    const currentBlockData = {
      blockNumber: 1,
      blockHash: '0x1234',
      depositRoot: '0x2345',
      keysOpIndex: 1,
      nextSigningKeys: [] as string[],
      nodeOperatorsCache,
      depositedEvents,
      guardianAddress: '0x3456',
      guardianIndex: 1,
      isDepositsPaused: false,
    };

    it('should call handleKeysIntersections if next keys are found in the deposit contract', async () => {
      const depositedKey = depositedPubKeys[0];
      const nextSigningKeys = [depositedKey];
      const blockData = { ...currentBlockData, nextSigningKeys };

      const mockHandleCorrectKeys = jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockHandleKeysIntersections = jest
        .spyOn(guardianService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      await guardianService.checkKeysIntersections(blockData);

      expect(mockHandleCorrectKeys).not.toBeCalled();
      expect(mockHandleKeysIntersections).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).toBeCalledWith(blockData);
    });

    it('should call handleCorrectKeys if Lido next keys are not found in the deposit contract', async () => {
      const notDepositedKey = '0x2345';
      const nextSigningKeys = [notDepositedKey];
      const blockData = { ...currentBlockData, nextSigningKeys };

      const mockHandleCorrectKeys = jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockHandleKeysIntersections = jest
        .spyOn(guardianService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      await guardianService.checkKeysIntersections(blockData);

      expect(mockHandleKeysIntersections).not.toBeCalled();
      expect(mockHandleCorrectKeys).toBeCalledTimes(1);
      expect(mockHandleCorrectKeys).toBeCalledWith(blockData);
    });
  });

  describe('handleCorrectKeys', () => {
    const signature = {} as any;
    const currentContractState = {
      keysOpIndex: 1,
      depositRoot: '0x1',
      blockNumber: 1,
    };
    const blockData = { ...currentContractState } as any;

    it('should check contracts state', async () => {
      const mockSendMessageFromGuardian = jest
        .spyOn(guardianService, 'sendMessageFromGuardian')
        .mockImplementation(async () => undefined);

      const mockIsSameContractsStates = jest.spyOn(
        guardianService,
        'isSameContractsStates',
      );

      const mockSignDepositData = jest
        .spyOn(securityService, 'signDepositData')
        .mockImplementation(async () => signature);

      await guardianService.handleCorrectKeys(blockData);
      await guardianService.handleCorrectKeys(blockData);

      expect(mockIsSameContractsStates).toBeCalledTimes(2);
      const { results } = mockIsSameContractsStates.mock;
      expect(results[0].value).toBeFalsy();
      expect(results[1].value).toBeTruthy();

      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
      expect(mockSignDepositData).toBeCalledTimes(1);
    });

    it('should send deposit message', async () => {
      const mockSendMessageFromGuardian = jest
        .spyOn(guardianService, 'sendMessageFromGuardian')
        .mockImplementation(async () => undefined);

      const mockSignDepositData = jest
        .spyOn(securityService, 'signDepositData')
        .mockImplementation(async () => signature);

      await guardianService.handleCorrectKeys(blockData);

      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
      expect(mockSignDepositData).toBeCalledTimes(1);
    });
  });

  describe('handleKeysIntersections', () => {
    const signature = {} as any;
    const blockData = { blockNumber: 1 } as any;
    const type = MessageType.PAUSE;

    beforeEach(async () => {
      jest
        .spyOn(securityService, 'signPauseData')
        .mockImplementation(async () => signature);
    });

    it('should pause deposits', async () => {
      jest
        .spyOn(guardianService, 'sendMessageFromGuardian')
        .mockImplementation(async () => undefined);

      const mockPauseDeposits = jest
        .spyOn(securityService, 'pauseDeposits')
        .mockImplementation(async () => undefined);

      await guardianService.handleKeysIntersections(blockData);

      expect(mockPauseDeposits).toBeCalledTimes(1);
      expect(mockPauseDeposits).toBeCalledWith(
        blockData.blockNumber,
        signature,
      );
    });

    it('should send pause message', async () => {
      const mockSendMessageFromGuardian = jest
        .spyOn(guardianService, 'sendMessageFromGuardian')
        .mockImplementation(async () => undefined);

      jest
        .spyOn(securityService, 'pauseDeposits')
        .mockImplementation(async () => undefined);

      await guardianService.handleKeysIntersections(blockData);

      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
      expect(mockSendMessageFromGuardian).toBeCalledWith(
        expect.objectContaining({ type, signature, ...blockData }),
      );
    });
  });

  describe('isSameContractsStates', () => {
    it('should return true if states are the same', () => {
      const state = { depositRoot: '0x1', keysOpIndex: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(
        { ...state },
        { ...state },
      );
      expect(result).toBeTruthy();
    });

    it('should return true if blockNumbers are close', () => {
      const state = { depositRoot: '0x1', keysOpIndex: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(state, {
        ...state,
        blockNumber: state.blockNumber + 1,
      });
      expect(result).toBeTruthy();
    });

    it('should return false if blockNumbers are too far', () => {
      const state = { depositRoot: '0x1', keysOpIndex: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(state, {
        ...state,
        blockNumber: state.blockNumber + 200,
      });
      expect(result).toBeFalsy();
    });

    it('should return false if depositRoot are different', () => {
      const state = { depositRoot: '0x1', keysOpIndex: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(state, {
        ...state,
        depositRoot: '0x2',
      });
      expect(result).toBeFalsy();
    });

    it('should return false if keysOpIndex are different', () => {
      const state = { depositRoot: '0x1', keysOpIndex: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(state, {
        ...state,
        keysOpIndex: 2,
      });
      expect(result).toBeFalsy();
    });
  });

  describe('addMessageMetaData', () => {
    it('should add extra data to message', () => {
      const message = { foo: 'bar' };
      const result = guardianService.addMessageMetaData(message);

      expect(result).toEqual(
        expect.objectContaining({
          ...message,
          app: { version: expect.any(String), name: expect.any(String) },
        }),
      );
    });
  });

  describe('sendMessageFromGuardian', () => {
    it('should send message if guardian is in the list', async () => {
      const message = { guardianIndex: 1 } as any;
      const mockSendMessage = jest
        .spyOn(messagesService, 'sendMessage')
        .mockImplementation(async () => undefined);

      await guardianService.sendMessageFromGuardian(message);

      expect(mockSendMessage).toBeCalledTimes(1);
      expect(mockSendMessage).toBeCalledWith(expect.objectContaining(message));
    });

    it('should not send message if guardian is not in the list', async () => {
      const message = { guardianIndex: -1 } as any;
      const mockSendMessage = jest
        .spyOn(messagesService, 'sendMessage')
        .mockImplementation(async () => undefined);

      await guardianService.sendMessageFromGuardian(message);

      expect(mockSendMessage).not.toBeCalled();
    });
  });
});
