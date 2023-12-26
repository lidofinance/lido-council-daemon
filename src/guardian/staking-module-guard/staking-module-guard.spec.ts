import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { PrometheusModule } from 'common/prometheus';
import { SecurityModule, SecurityService } from 'contracts/security';
import { RepositoryModule } from 'contracts/repository';
import { LidoModule } from 'contracts/lido';
import { MessageType } from 'messages';
import { StakingModuleGuardModule } from './staking-module-guard.module';
import { StakingRouterModule, StakingRouterService } from 'staking-router';
import { GuardianMetricsModule } from '../guardian-metrics';
import {
  GuardianMessageModule,
  GuardianMessageService,
} from '../guardian-message';
import { StakingModuleGuardService } from './staking-module-guard.service';
import { StakingModuleData } from 'guardian/interfaces';
import {
  vettedKeysDuplicatesAcrossModules,
  vettedKeysDuplicatesAcrossOneModule,
  vettedKeysDuplicatesAcrossOneModuleAndFew,
  vettedKeysWithoutDuplicates,
} from './keys.fixtures';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { KeysValidationModule } from 'guardian/keys-validation/keys-validation.module';
import { KeysValidationService } from 'guardian/keys-validation/keys-validation.service';

jest.mock('../../transport/stomp/stomp.client');

const TEST_MODULE_ID = 1;

const stakingModuleData = {
  nonce: 0,
  type: 'string',
  stakingModuleId: TEST_MODULE_ID,
  stakingModuleAddress: 'string',
  moduleFee: 0,
  treasuryFee: 0,
  targetShare: 0,
  status: 0,
  name: 'string',
  lastDepositAt: 0,
  lastDepositBlock: 0,
  blockHash: '',
  isDepositsPaused: false,
};

describe('StakingModuleGuardService', () => {
  let loggerService: LoggerService;
  let securityService: SecurityService;
  let stakingModuleGuardService: StakingModuleGuardService;
  let guardianMessageService: GuardianMessageService;
  let stakingRouterService: StakingRouterService;
  let keysValidationService: KeysValidationService;
  let findInvalidKeys: jest.SpyInstance;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        StakingModuleGuardModule,
        SecurityModule,
        LidoModule,
        StakingRouterModule,
        GuardianMetricsModule,
        GuardianMessageModule,
        RepositoryModule,
        PrometheusModule,
        KeysValidationModule,
      ],
    }).compile();

    securityService = moduleRef.get(SecurityService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);
    stakingModuleGuardService = moduleRef.get(StakingModuleGuardService);
    guardianMessageService = moduleRef.get(GuardianMessageService);
    stakingRouterService = moduleRef.get(StakingRouterService);
    keysValidationService = moduleRef.get(KeysValidationService);
    findInvalidKeys = jest.spyOn(keysValidationService, 'findInvalidKeys');

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);
  });

  describe('getKeysIntersections', () => {
    it('should find the keys when they match', () => {
      const unusedKeys = ['0x1'];
      const depositedKeys = ['0x1'];
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { unusedKeys, depositedEvents } as any;
      const matched = stakingModuleGuardService.getKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );

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
      const matched = stakingModuleGuardService.getKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );

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
      const matched = stakingModuleGuardService.getKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
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

    it('should call handleKeysIntersections if unused keys are found in the deposit contract', async () => {
      const depositedKey = depositedPubKeys[0];
      const unusedKeys = [depositedKey];
      const events = currentBlockData.depositedEvents.events.map(
        ({ ...data }) => ({ ...data, wc: attackerWC } as any),
      );

      const blockData = {
        ...currentBlockData,
        depositedEvents: { ...currentBlockData.depositedEvents, events },
        unusedKeys,
        lidoWC,
      };

      const mockHandleCorrectKeys = jest
        .spyOn(stakingModuleGuardService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockHandleKeysIntersections = jest
        .spyOn(stakingModuleGuardService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      const mockSecurityContractIsDepositsPaused = jest
        .spyOn(securityService, 'isDepositsPaused')
        .mockImplementation(async () => false);

      await stakingModuleGuardService.checkKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(mockHandleCorrectKeys).not.toBeCalled();
      expect(mockHandleKeysIntersections).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).toBeCalledWith(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );
      expect(mockSecurityContractIsDepositsPaused).toBeCalledTimes(1);
    });

    it('should call handleCorrectKeys if Lido unused keys are not found in the deposit contract and vetted unused keys are valid', async () => {
      const notDepositedKey = '0x2345';
      const unusedKeys = [notDepositedKey];
      const blockData = { ...currentBlockData, unusedKeys, lidoWC };

      const mockHandleCorrectKeys = jest
        .spyOn(stakingModuleGuardService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockHandleKeysIntersections = jest
        .spyOn(stakingModuleGuardService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      const mockSecurityContractIsDepositsPaused = jest
        .spyOn(securityService, 'isDepositsPaused')
        .mockImplementation(async () => false);

      // not found invalid keys
      findInvalidKeys.mockImplementation(async () => []);

      await stakingModuleGuardService.checkKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).not.toBeCalled();
      expect(mockHandleCorrectKeys).toBeCalledTimes(1);
      expect(mockHandleCorrectKeys).toBeCalledWith(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );
      expect(mockSecurityContractIsDepositsPaused).toBeCalledTimes(1);
    });

    it('should not call handleCorrectKeys if vetted unused keys are invalid', async () => {
      const notDepositedKey = '0x2345';
      const unusedKeys = [notDepositedKey];
      const blockData = { ...currentBlockData, unusedKeys, lidoWC };

      const mockHandleCorrectKeys = jest
        .spyOn(stakingModuleGuardService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockHandleKeysIntersections = jest
        .spyOn(stakingModuleGuardService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      const mockSecurityContractIsDepositsPaused = jest
        .spyOn(securityService, 'isDepositsPaused')
        .mockImplementation(async () => false);

      //  found invalid keys
      findInvalidKeys.mockImplementation(async () => ['something']);

      await stakingModuleGuardService.checkKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).not.toBeCalled();
      expect(mockHandleCorrectKeys).not.toBeCalled();
      expect(mockSecurityContractIsDepositsPaused).toBeCalledTimes(1);

      // check that if lastChangedBlockHash the same but keys prev was invalid , handleCorrect will not be called
      // but we also will not validate keys again
      findInvalidKeys.mockClear();

      await stakingModuleGuardService.checkKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).not.toBeCalled();
      expect(mockHandleKeysIntersections).not.toBeCalled();
      expect(mockHandleCorrectKeys).not.toBeCalled();
      // second execution
      expect(mockSecurityContractIsDepositsPaused).toBeCalledTimes(2);

      // now we fixed keys (lastChangedBlockHash was changed) and we will run validation again
      findInvalidKeys.mockImplementation(async () => []);

      await stakingModuleGuardService.checkKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '0x1',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).not.toBeCalled();
      expect(mockHandleCorrectKeys).toBeCalledTimes(1);
      expect(mockHandleCorrectKeys).toBeCalledWith(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '0x1',
          unusedKeys,
          vettedUnusedKeys: [],
        },
        blockData,
      );
      expect(mockSecurityContractIsDepositsPaused).toBeCalledTimes(3);
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
        .spyOn(guardianMessageService, 'sendMessageFromGuardian')
        .mockImplementation(async () => undefined);

      const mockIsSameContractsStates = jest.spyOn(
        stakingModuleGuardService,
        'isSameContractsStates',
      );

      const mockSignDepositData = jest
        .spyOn(securityService, 'signDepositData')
        .mockImplementation(async () => signature);

      await stakingModuleGuardService.handleCorrectKeys(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );
      await stakingModuleGuardService.handleCorrectKeys(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(mockIsSameContractsStates).toBeCalledTimes(2);
      const { results } = mockIsSameContractsStates.mock;
      expect(results[0].value).toBeFalsy();
      expect(results[1].value).toBeTruthy();

      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
      expect(mockSignDepositData).toBeCalledTimes(1);
    });

    it('should send deposit message', async () => {
      const mockSendMessageFromGuardian = jest
        .spyOn(guardianMessageService, 'sendMessageFromGuardian')
        .mockImplementation(async () => undefined);

      const mockSignDepositData = jest
        .spyOn(securityService, 'signDepositData')
        .mockImplementation(async () => signature);

      await stakingModuleGuardService.handleCorrectKeys(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
      expect(mockSignDepositData).toBeCalledTimes(1);
    });
  });

  describe('isVettedUnusedKeysValid', () => {
    const blockData = {} as any;

    it('should return false if last state was undefined and found invalid key', async () => {
      findInvalidKeys.mockImplementation(() => ['something']);

      const result = await stakingModuleGuardService.isVettedUnusedKeysValid(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(1);
      expect(result).toBeFalsy();
    });

    it('should return true if last state was undefined and keys are valid', async () => {
      findInvalidKeys.mockImplementation(() => []);
      const result = await stakingModuleGuardService.isVettedUnusedKeysValid(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(1);
      expect(result).toBeTruthy();
    });

    it('should return false if prev found invalid key and lastChangedBlockHash was not changed', async () => {
      findInvalidKeys.mockImplementation(() => ['something']);

      const result = await stakingModuleGuardService.isVettedUnusedKeysValid(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(1);
      expect(result).toBeFalsy();

      findInvalidKeys.mockClear();

      const newResult = await stakingModuleGuardService.isVettedUnusedKeysValid(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(0);
      expect(newResult).toBeFalsy();
    });

    it('should return true if prev found invalid key and problem was solved', async () => {
      findInvalidKeys.mockImplementation(() => ['something']);

      const result = await stakingModuleGuardService.isVettedUnusedKeysValid(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(1);
      expect(result).toBeFalsy();

      findInvalidKeys.mockImplementation(() => []);

      const newResult = await stakingModuleGuardService.isVettedUnusedKeysValid(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '0x1',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(2);
      expect(newResult).toBeTruthy();
    });

    it('should run validation if prev didnt find invalid key and lastChangedBlockHash was not changed', async () => {
      // TODO: maybe delete this test
      // isVettedUnusedKeysValid didn't change state in positive case
      // what is why lastState in this case is undefined
      findInvalidKeys.mockImplementation(() => []);

      const result = await stakingModuleGuardService.isVettedUnusedKeysValid(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(1);
      expect(result).toBeTruthy();

      const newResult = await stakingModuleGuardService.isVettedUnusedKeysValid(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(findInvalidKeys).toBeCalledTimes(2);
      expect(newResult).toBeTruthy();
    });
  });

  describe('excludeEligibleIntersections', () => {
    const pubkey = '0x1234';
    const lidoWC = '0x12';
    const attackerWC = '0x23';
    const blockData = { blockHash: '0x1234', lidoWC } as any;

    it('should exclude invalid intersections', async () => {
      // here should be in real test valid deposit
      // but function ignore it
      const intersections = [{ valid: false, pubkey, wc: lidoWC } as any];

      const filteredIntersections =
        await stakingModuleGuardService.excludeEligibleIntersections(
          blockData,
          intersections,
        );

      expect(filteredIntersections).toHaveLength(0);
    });

    it('should exclude intersections with lido WC', async () => {
      const intersections = [{ valid: true, pubkey, wc: lidoWC } as any];

      const filteredIntersections =
        await stakingModuleGuardService.excludeEligibleIntersections(
          blockData,
          intersections,
        );

      expect(filteredIntersections).toHaveLength(0);
    });

    it('should not exclude intersections with attacker WC', async () => {
      const intersections = [{ valid: true, pubkey, wc: attackerWC } as any];

      const filteredIntersections =
        await stakingModuleGuardService.excludeEligibleIntersections(
          blockData,
          intersections,
        );

      expect(filteredIntersections).toHaveLength(1);
      expect(filteredIntersections).toEqual(intersections);
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
        .spyOn(guardianMessageService, 'sendMessageFromGuardian')
        .mockImplementation(async () => undefined);

      const mockPauseDeposits = jest
        .spyOn(securityService, 'pauseDeposits')
        .mockImplementation(async () => undefined);

      await stakingModuleGuardService.handleKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(mockPauseDeposits).toBeCalledTimes(1);
      expect(mockPauseDeposits).toBeCalledWith(
        blockData.blockNumber,
        TEST_MODULE_ID,
        signature,
      );
    });

    it('should send pause message', async () => {
      const mockSendMessageFromGuardian = jest
        .spyOn(guardianMessageService, 'sendMessageFromGuardian')
        .mockImplementation(async () => undefined);

      jest
        .spyOn(securityService, 'pauseDeposits')
        .mockImplementation(async () => undefined);

      await stakingModuleGuardService.handleKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
        },
        blockData,
      );

      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
      expect(mockSendMessageFromGuardian).toBeCalledWith(
        expect.objectContaining({ type, signature, ...blockData }),
      );
    });
  });

  describe('isSameContractsStates', () => {
    it('should return true if states are the same', () => {
      const state = {
        depositRoot: '0x1',
        nonce: 1,
        blockNumber: 100,
        lastChangedBlockHash: 'hash',
        invalidKeysFound: false,
      };
      const result = stakingModuleGuardService.isSameContractsStates(
        { ...state },
        { ...state },
      );
      expect(result).toBeTruthy();
    });

    it('should return true if blockNumbers are close', () => {
      const state = {
        depositRoot: '0x1',
        nonce: 1,
        blockNumber: 100,
        lastChangedBlockHash: 'hash',
        invalidKeysFound: false,
      };
      const result = stakingModuleGuardService.isSameContractsStates(state, {
        ...state,
        blockNumber: state.blockNumber + 1,
      });
      expect(result).toBeTruthy();
    });

    it('should return false if blockNumbers are too far', () => {
      const state = {
        depositRoot: '0x1',
        nonce: 1,
        blockNumber: 100,
        lastChangedBlockHash: 'hash',
        invalidKeysFound: false,
      };
      const result = stakingModuleGuardService.isSameContractsStates(state, {
        ...state,
        blockNumber: state.blockNumber + 200,
      });
      expect(result).toBeFalsy();
    });

    it('should return false if depositRoot are different', () => {
      const state = {
        depositRoot: '0x1',
        nonce: 1,
        blockNumber: 100,
        lastChangedBlockHash: 'hash',
        invalidKeysFound: false,
      };
      const result = stakingModuleGuardService.isSameContractsStates(state, {
        ...state,
        depositRoot: '0x2',
      });
      expect(result).toBeFalsy();
    });

    it('should return false if lastChangedBlockHash are different', () => {
      // It's important to note that it's not possible for the nonce to be different
      // while having the same 'lastChangedBlockHash'.
      const state = {
        depositRoot: '0x1',
        nonce: 1,
        blockNumber: 100,
        lastChangedBlockHash: 'hash',
        invalidKeysFound: false,
      };
      const result = stakingModuleGuardService.isSameContractsStates(state, {
        ...state,
        lastChangedBlockHash: 'new hash',
      });
      expect(result).toBeFalsy();
    });
  });

  describe('excludeModulesWithDuplicatedKeys', () => {
    const stakingModules: StakingModuleData[] = [
      {
        blockHash: '',
        unusedKeys: [],
        vettedUnusedKeys: [],
        nonce: 0,
        stakingModuleId: 1,
        lastChangedBlockHash: '',
      },
      {
        blockHash: '',
        unusedKeys: [],
        vettedUnusedKeys: [],
        nonce: 0,
        stakingModuleId: 2,
        lastChangedBlockHash: '',
      },
      {
        blockHash: '',
        unusedKeys: [],
        vettedUnusedKeys: [],
        nonce: 0,
        stakingModuleId: 3,
        lastChangedBlockHash: '',
      },
    ];

    it('should exclude modules', () => {
      const moduleIdsWithDuplicateKeys = [2];
      const expectedStakingModules: StakingModuleData[] = [
        {
          blockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
          nonce: 0,
          stakingModuleId: 1,
          lastChangedBlockHash: '',
        },
        {
          blockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
          nonce: 0,
          stakingModuleId: 3,
          lastChangedBlockHash: '',
        },
      ];

      const result = stakingModuleGuardService.excludeModulesWithDuplicatedKeys(
        stakingModules,
        moduleIdsWithDuplicateKeys,
      );

      expect(result.length).toEqual(2);
      expect(result).toEqual(expect.arrayContaining(expectedStakingModules));
    });

    it('should return list without changes', () => {
      const moduleIdsWithDuplicateKeys = [4];
      const expectedStakingModules: StakingModuleData[] = [
        {
          blockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
          nonce: 0,
          stakingModuleId: 1,
          lastChangedBlockHash: '',
        },
        {
          blockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
          nonce: 0,
          stakingModuleId: 2,
          lastChangedBlockHash: '',
        },
        {
          blockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
          nonce: 0,
          stakingModuleId: 3,
          lastChangedBlockHash: '',
        },
      ];

      const result = stakingModuleGuardService.excludeModulesWithDuplicatedKeys(
        stakingModules,
        moduleIdsWithDuplicateKeys,
      );

      expect(result.length).toEqual(3);
      expect(result).toEqual(expect.arrayContaining(expectedStakingModules));
    });

    it('should return list without changes if duplicated keys were not found', () => {
      const moduleIdsWithDuplicateKeys = [];
      const expectedStakingModules: StakingModuleData[] = [
        {
          blockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
          nonce: 0,
          stakingModuleId: 1,
          lastChangedBlockHash: '',
        },
        {
          blockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
          nonce: 0,
          stakingModuleId: 2,
          lastChangedBlockHash: '',
        },
        {
          blockHash: '',
          unusedKeys: [],
          vettedUnusedKeys: [],
          nonce: 0,
          stakingModuleId: 3,
          lastChangedBlockHash: '',
        },
      ];

      const result = stakingModuleGuardService.excludeModulesWithDuplicatedKeys(
        stakingModules,
        moduleIdsWithDuplicateKeys,
      );

      expect(result.length).toEqual(3);
      expect(result).toEqual(expect.arrayContaining(expectedStakingModules));
    });
  });

  describe('getModulesIdsWithDuplicatedVettedUnusedKeys', () => {
    const blockData = { blockHash: 'some_hash' } as any;

    it('should found duplicated keys across two module', () => {
      const result =
        stakingModuleGuardService.getModulesIdsWithDuplicatedVettedUnusedKeys(
          vettedKeysDuplicatesAcrossModules,
          blockData,
        );

      const addressesOfModulesWithDuplicateKeys = [100, 102];

      // result has all addressesOfModulesWithDuplicateKeys elements
      // but it also could contain more elements, that is why we check length too
      expect(result).toEqual(
        expect.arrayContaining(addressesOfModulesWithDuplicateKeys),
      );
      expect(result.length).toEqual(2);
    });

    it('should found duplicated keys across one module', () => {
      const result =
        stakingModuleGuardService.getModulesIdsWithDuplicatedVettedUnusedKeys(
          vettedKeysDuplicatesAcrossOneModule,
          blockData,
        );

      const addressesOfModulesWithDuplicateKeys = [100];
      expect(result).toEqual(
        expect.arrayContaining(addressesOfModulesWithDuplicateKeys),
      );
      expect(result.length).toEqual(1);
    });

    it('should found duplicated keys across one module and few', () => {
      const result =
        stakingModuleGuardService.getModulesIdsWithDuplicatedVettedUnusedKeys(
          vettedKeysDuplicatesAcrossOneModuleAndFew,
          blockData,
        );

      const addressesOfModulesWithDuplicateKeys = [100, 102];
      expect(result).toEqual(
        expect.arrayContaining(addressesOfModulesWithDuplicateKeys),
      );
      expect(result.length).toEqual(2);
    });

    it('should return empty list if duplicated keys were not found', () => {
      const result =
        stakingModuleGuardService.getModulesIdsWithDuplicatedVettedUnusedKeys(
          vettedKeysWithoutDuplicates,
          blockData,
        );

      const addressesOfModulesWithDuplicateKeys = [];

      expect(result).toEqual(
        expect.arrayContaining(addressesOfModulesWithDuplicateKeys),
      );
      expect(result.length).toEqual(0);
    });
  });

  describe('findAlreadyDepositedKeys', () => {
    // function that return list from kapi that match keys in parameter
    it('intersection is empty', async () => {
      const intersectionsWithLidoWC = [];
      // function that return list from kapi that match keys in parameter
      const mockSendMessageFromGuardian = jest.spyOn(
        stakingRouterService,
        'findKeysEntires',
      );

      const result = await stakingModuleGuardService.findAlreadyDepositedKeys(
        'lastHash',
        intersectionsWithLidoWC,
      );

      expect(result).toEqual([]);
      expect(mockSendMessageFromGuardian).toBeCalledTimes(0);
    });

    it('should return keys list if deposits with lido wc were made by lido', async () => {
      const pubkeyWithUsedKey1 = '0x1234';
      const pubkeyWithoutUsedKey = '0x56789';
      const pubkeyWithUsedKey2 = '0x3478';
      const lidoWC = '0x12';
      const intersectionsWithLidoWC = [
        { pubkey: pubkeyWithUsedKey1, wc: lidoWC, valid: true } as any,
        { pubkey: pubkeyWithoutUsedKey, wc: lidoWC, valid: true } as any,
        { pubkey: pubkeyWithUsedKey2, wc: lidoWC, valid: true } as any,
      ];
      // function that return list from kapi that match keys in parameter
      const mockSendMessageFromGuardian = jest
        .spyOn(stakingRouterService, 'findKeysEntires')
        .mockImplementation(async () => ({
          data: [
            {
              key: pubkeyWithUsedKey1,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
            {
              key: pubkeyWithUsedKey1,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: true,
              index: 0,
              moduleAddress: '0x0000',
            },
            {
              key: pubkeyWithUsedKey2,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
            {
              key: pubkeyWithUsedKey2,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: true,
              index: 0,
              moduleAddress: '0x0000',
            },
            {
              key: pubkeyWithoutUsedKey,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
          ],
          meta: {
            elBlockSnapshot: {
              blockNumber: 0,
              blockHash: 'hash',
              timestamp: 12345,
              lastChangedBlockHash: 'lastHash',
            },
          },
        }));

      const result = await stakingModuleGuardService.findAlreadyDepositedKeys(
        'lastHash',
        intersectionsWithLidoWC,
      );

      expect(result.length).toEqual(2);
      expect(result).toEqual(
        expect.arrayContaining([
          {
            key: pubkeyWithUsedKey1,
            depositSignature: 'signature',
            operatorIndex: 0,
            used: true,
            index: 0,
            moduleAddress: '0x0000',
          },
          {
            key: pubkeyWithUsedKey2,
            depositSignature: 'signature',
            operatorIndex: 0,
            used: true,
            index: 0,
            moduleAddress: '0x0000',
          },
        ]),
      );
      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
    });

    it('should return empty list if deposits with lido wc were made by someone else ', async () => {
      const pubkey1 = '0x1234';
      const pubkey2 = '0x56789';
      const pubkey3 = '0x3478';
      const lidoWC = '0x12';
      const intersectionsWithLidoWC = [
        { pubkey: pubkey1, wc: lidoWC, valid: true } as any,
        { pubkey: pubkey2, wc: lidoWC, valid: true } as any,
        { pubkey: pubkey3, wc: lidoWC, valid: true } as any,
      ];
      // function that return list from kapi that match keys in parameter
      const mockSendMessageFromGuardian = jest
        .spyOn(stakingRouterService, 'findKeysEntires')
        .mockImplementation(async () => ({
          data: [
            {
              key: pubkey1,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
            {
              key: pubkey2,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
            {
              key: pubkey3,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
          ],
          meta: {
            elBlockSnapshot: {
              blockNumber: 0,
              blockHash: 'hash',
              timestamp: 12345,
              lastChangedBlockHash: 'lastHash',
            },
          },
        }));

      const result = await stakingModuleGuardService.findAlreadyDepositedKeys(
        'lastHash',
        intersectionsWithLidoWC,
      );

      expect(result).toEqual([]);
      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
    });

    it('should throw error if lastChangedBlockHash that kapi returned is not equal to prev value', async () => {
      const pubkey1 = '0x1234';
      const pubkey2 = '0x56789';
      const pubkey3 = '0x3478';
      const lidoWC = '0x12';
      const intersectionsWithLidoWC = [
        { pubkey: pubkey1, wc: lidoWC, valid: true } as any,
        { pubkey: pubkey2, wc: lidoWC, valid: true } as any,
        { pubkey: pubkey3, wc: lidoWC, valid: true } as any,
      ];
      // function that return list from kapi that match keys in parameter
      const mockSendMessageFromGuardian = jest
        .spyOn(stakingRouterService, 'findKeysEntires')
        .mockImplementation(async () => ({
          data: [
            {
              key: pubkey1,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
            {
              key: pubkey2,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
            {
              key: pubkey3,
              depositSignature: 'signature',
              operatorIndex: 0,
              used: false,
              index: 0,
              moduleAddress: '0x0000',
            },
          ],
          meta: {
            elBlockSnapshot: {
              blockNumber: 0,
              blockHash: 'hash',
              timestamp: 12345,
              lastChangedBlockHash: 'lastHash',
            },
          },
        }));

      const prevLastChangedBlockHash = 'prevHash';

      expect(
        stakingModuleGuardService.findAlreadyDepositedKeys(
          prevLastChangedBlockHash,
          intersectionsWithLidoWC,
        ),
      ).rejects.toThrowError(new InconsistentLastChangedBlockHash());

      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
    });
  });
});
