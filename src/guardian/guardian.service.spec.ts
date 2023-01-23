import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { GuardianService } from './guardian.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';
import { DepositService } from 'contracts/deposit';
import { SecurityService } from 'contracts/security';
import { RepositoryModule } from 'contracts/repository';
import { LidoService } from 'contracts/lido';
import { MessagesService, MessageType } from 'messages';
import { StakingRouterService } from 'staking-router';

jest.mock('../transport/stomp/stomp.client');

const TEST_MODULE_ID = 1;

const stakingModuleResponse = {
  data: [
    {
      nonce: 0,
      type: 'string',
      id: TEST_MODULE_ID,
      stakingModuleAddress: 'string',
      moduleFee: 0,
      treasuryFee: 0,
      targetShare: 0,
      status: 0,
      name: 'string',
      lastDepositAt: 0,
      lastDepositBlock: 0,
    },
  ],
  elBlockSnapshot: {
    blockNumber: 0,
    blockHash: 'string',
    timestamp: 0,
  },
};

describe('GuardianService', () => {
  let stakingRouterService: StakingRouterService;
  let guardianService: GuardianService;
  let loggerService: LoggerService;
  let depositService: DepositService;
  let lidoService: LidoService;
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

    stakingRouterService = moduleRef.get(StakingRouterService);
    guardianService = moduleRef.get(GuardianService);
    depositService = moduleRef.get(DepositService);
    lidoService = moduleRef.get(LidoService);
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

  describe('getKeysIntersections', () => {
    it('should find the keys when they match', () => {
      const unusedKeys = ['0x1'];
      const depositedKeys = ['0x1'];
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { unusedKeys, depositedEvents } as any;
      const matched = guardianService.getKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(1);
      expect(matched).toContainEqual({ pubkey: '0x1' });
    });

    it('should not find the keys when they don’t match', () => {
      const unusedKeys = ['0x2'];
      const depositedKeys = ['0x1'];
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { unusedKeys, depositedEvents } as any;
      const matched = guardianService.getKeysIntersections(blockData);

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });

    it('should work if array is empty', () => {
      const unusedKeys = [];
      const depositedKeys = ['0x1'];
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { unusedKeys, depositedEvents } as any;
      const matched = guardianService.getKeysIntersections(blockData);

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

      const getStakingModulesMock = jest
        .spyOn(stakingRouterService, 'getStakingModules')
        .mockImplementation(async () => stakingModuleResponse);

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

      const mockCollectMetrics = jest
        .spyOn(guardianService, 'collectMetrics')
        .mockImplementation(() => undefined);

      await Promise.all([
        guardianService.handleNewBlock(),
        guardianService.handleNewBlock(),
      ]);

      expect(getStakingModulesMock).toBeCalledTimes(1);
      expect(mockHandleNewBlock).toBeCalledTimes(1);
      expect(mockGetCurrentBlockData).toBeCalledTimes(1);
      expect(mockDepositHandleNewBlock).toBeCalledTimes(1);
      expect(mockPingMessageBroker).toBeCalledTimes(1);
      expect(mockCollectMetrics).toBeCalledTimes(1);
    });
  });

  describe('checkKeysIntersections', () => {
    const lidoWC = '0x12';
    const attackerWC = '0x23';
    const depositedPubKeys = ['0x1234', '0x5678'];
    const depositedEvents = {
      startBlock: 1,
      endBlock: 5,
      events: depositedPubKeys.map(
        (pubkey) => ({ pubkey, valid: true } as any),
      ),
    };
    const nodeOperatorsCache = {
      depositRoot: '0x2345',
      nonce: 1,
      operators: [],
      version: '1',
    };

    const currentBlockData = {
      blockNumber: 1,
      blockHash: '0x1234',
      depositRoot: '0x2345',
      nonce: 1,
      nextSigningKeys: [] as string[],
      nodeOperatorsCache,
      depositedEvents,
      guardianAddress: '0x3456',
      guardianIndex: 1,
      isDepositsPaused: false,
      srModuleId: 1,
    };

    it('should call handleKeysIntersections if next keys are found in the deposit contract', async () => {
      const depositedKey = depositedPubKeys[0];
      const unusedKeys = [depositedKey];
      const events = currentBlockData.depositedEvents.events.map(
        ({ ...data }) => ({ ...data, wc: attackerWC } as any),
      );

      const blockData = {
        ...currentBlockData,
        depositedEvents: { ...currentBlockData.depositedEvents, events },
        unusedKeys,
      };

      const mockHandleCorrectKeys = jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockHandleKeysIntersections = jest
        .spyOn(guardianService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      const mockGetWithdrawalCredentials = jest
        .spyOn(lidoService, 'getWithdrawalCredentials')
        .mockImplementation(async () => lidoWC);

      await guardianService.checkKeysIntersections(blockData);

      expect(mockHandleCorrectKeys).not.toBeCalled();
      expect(mockHandleKeysIntersections).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).toBeCalledWith(blockData);
      expect(mockGetWithdrawalCredentials).toBeCalledTimes(1);
    });

    it('should call handleCorrectKeys if Lido next keys are not found in the deposit contract', async () => {
      const notDepositedKey = '0x2345';
      const unusedKeys = [notDepositedKey];
      const blockData = { ...currentBlockData, unusedKeys };

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
      nonce: 1,
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

  describe('excludeEligibleIntersections', () => {
    const pubkey = '0x1234';
    const lidoWC = '0x12';
    const attackerWC = '0x23';
    const blockData = { blockHash: '0x1234' } as any;

    beforeEach(async () => {
      jest
        .spyOn(lidoService, 'getWithdrawalCredentials')
        .mockImplementation(async () => lidoWC);
    });

    it('should exclude invalid intersections', async () => {
      const intersections = [{ valid: false, pubkey, wc: lidoWC } as any];

      const filteredIntersections =
        await guardianService.excludeEligibleIntersections(
          intersections,
          blockData,
        );

      expect(filteredIntersections).toHaveLength(0);
    });

    it('should exclude intersections with lido WC', async () => {
      const intersections = [{ valid: true, pubkey, wc: lidoWC } as any];

      const filteredIntersections =
        await guardianService.excludeEligibleIntersections(
          intersections,
          blockData,
        );

      expect(filteredIntersections).toHaveLength(0);
    });

    it('should not exclude intersections with attacker WC', async () => {
      const intersections = [{ valid: true, pubkey, wc: attackerWC } as any];

      const filteredIntersections =
        await guardianService.excludeEligibleIntersections(
          intersections,
          blockData,
        );

      expect(filteredIntersections).toHaveLength(1);
      expect(filteredIntersections).toEqual(intersections);
    });
  });

  describe('handleKeysIntersections', () => {
    const signature = {} as any;
    const blockData = { blockNumber: 1, srModuleId: TEST_MODULE_ID } as any;
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
        TEST_MODULE_ID,
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
      const state = { depositRoot: '0x1', nonce: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(
        { ...state },
        { ...state },
      );
      expect(result).toBeTruthy();
    });

    it('should return true if blockNumbers are close', () => {
      const state = { depositRoot: '0x1', nonce: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(state, {
        ...state,
        blockNumber: state.blockNumber + 1,
      });
      expect(result).toBeTruthy();
    });

    it('should return false if blockNumbers are too far', () => {
      const state = { depositRoot: '0x1', nonce: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(state, {
        ...state,
        blockNumber: state.blockNumber + 200,
      });
      expect(result).toBeFalsy();
    });

    it('should return false if depositRoot are different', () => {
      const state = { depositRoot: '0x1', nonce: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(state, {
        ...state,
        depositRoot: '0x2',
      });
      expect(result).toBeFalsy();
    });

    it('should return false if nonce are different', () => {
      const state = { depositRoot: '0x1', nonce: 1, blockNumber: 100 };
      const result = guardianService.isSameContractsStates(state, {
        ...state,
        nonce: 2,
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
