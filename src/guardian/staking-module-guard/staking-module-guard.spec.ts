import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { PrometheusModule } from 'common/prometheus';
import { SecurityModule, SecurityService } from 'contracts/security';
import { RepositoryModule } from 'contracts/repository';
import { StakingModuleGuardModule } from './staking-module-guard.module';
import { GuardianMetricsModule } from '../guardian-metrics';
import {
  GuardianMessageModule,
  GuardianMessageService,
} from '../guardian-message';
import { StakingModuleGuardService } from './staking-module-guard.service';

import { KeysValidationModule } from 'guardian/keys-validation/keys-validation.module';
import { vettedKeys } from './keys.fixtures';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { KeysApiService } from 'keys-api/keys-api.service';

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
  let keysApiService: KeysApiService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        StakingModuleGuardModule,
        SecurityModule,
        KeysApiModule,
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
    keysApiService = moduleRef.get(KeysApiService);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);

    jest
      .spyOn(keysApiService, 'getKeysByPubkeys')
      .mockImplementation(async () => ({
        data: [],
        meta: {
          elBlockSnapshot: {
            blockNumber: 0,
            blockHash: 'hash',
            timestamp: 12345,
            lastChangedBlockHash: 'lastHash',
          },
        },
      }));
  });

  describe('getKeysIntersections', () => {
    it('should find the keys when they match', () => {
      const depositedKeys = vettedKeys.map((key) => key.key);
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { depositedEvents } as any;
      const matched = stakingModuleGuardService.getKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          vettedUnusedKeys: vettedKeys,
          isModuleDepositsPaused: false,
          invalidKeys: [],
          duplicatedKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
        },
        blockData,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(1);
      expect(matched).toContainEqual({ pubkey: vettedKeys[0].key });
    });

    it('should not find the keys when they don’t match', () => {
      const depositedKeys = [
        '0x9948d2becf42e9f76922bc6f664545e6f50401050af95785a984802d32a95c4c61f8e3de312b78167f86e047f83a7796',
      ];
      const depositedEvents = {
        events: depositedKeys.map((pubkey) => ({ pubkey } as any)),
      };
      const blockData = { depositedEvents } as any;
      const matched = stakingModuleGuardService.getKeysIntersections(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          vettedUnusedKeys: vettedKeys,
          isModuleDepositsPaused: false,
          invalidKeys: [],
          duplicatedKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
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
          vettedUnusedKeys: [],
          isModuleDepositsPaused: false,
          invalidKeys: [],
          duplicatedKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
        },
        blockData,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
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
          vettedUnusedKeys: [],
          isModuleDepositsPaused: false,
          invalidKeys: [],
          duplicatedKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
        },
        blockData,
      );
      await stakingModuleGuardService.handleCorrectKeys(
        {
          ...stakingModuleData,
          lastChangedBlockHash: '',
          vettedUnusedKeys: [],
          isModuleDepositsPaused: false,
          invalidKeys: [],
          duplicatedKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
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
          vettedUnusedKeys: [],
          isModuleDepositsPaused: false,
          invalidKeys: [],
          duplicatedKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
        },
        blockData,
      );

      expect(mockSendMessageFromGuardian).toBeCalledTimes(1);
      expect(mockSignDepositData).toBeCalledTimes(1);
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

  describe('isSameContractsStates', () => {
    it('should return true if states are the same', () => {
      const state = {
        depositRoot: '0x1',
        nonce: 1,
        blockNumber: 100,
        lastChangedBlockHash: 'hash',
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
      };
      const result = stakingModuleGuardService.isSameContractsStates(state, {
        ...state,
        lastChangedBlockHash: 'new hash',
      });
      expect(result).toBeFalsy();
    });
  });
});
