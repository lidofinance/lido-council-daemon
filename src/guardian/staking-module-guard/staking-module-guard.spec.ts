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
import { GuardianMessageService } from '../guardian-message';
import { StakingModuleGuardService } from './staking-module-guard.service';

import { KeysValidationModule } from 'guardian/keys-validation/keys-validation.module';
import { vettedKeys } from './keys.fixtures';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { KeysApiService } from 'keys-api/keys-api.service';
import { TransportInterface } from 'transport';
import { DATA_BUS_PROVIDER_TOKEN } from 'provider/data-bus-provider.module';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';

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
  withdrawalCredentials: '0x12',
  hasDepositsAllocation: true,
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
        RepositoryModule,
        PrometheusModule,
        KeysValidationModule,
      ],
    })
      .overrideProvider(TransportInterface)
      .useValue({
        publish: jest.fn(),
      })
      .overrideProvider(DATA_BUS_PROVIDER_TOKEN)
      .useValue({
        getNetwork: jest.fn(),
      })
      .overrideProvider(SimpleFallbackJsonRpcBatchProvider)
      .useValue({
        getNetwork: jest.fn(),
      })
      .compile();

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
          crossTypeKeys: [],
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
          crossTypeKeys: [],
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
          crossTypeKeys: [],
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
          crossTypeKeys: [],
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
          crossTypeKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
        },
        blockData,
      );

      expect(mockIsSameContractsStates).toHaveBeenCalledTimes(2);
      const { results } = mockIsSameContractsStates.mock;
      expect(results[0].value).toBeFalsy();
      expect(results[1].value).toBeTruthy();

      expect(mockSendMessageFromGuardian).toHaveBeenCalledTimes(1);
      expect(mockSignDepositData).toHaveBeenCalledTimes(1);
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
          crossTypeKeys: [],
          frontRunKeys: [],
          unresolvedDuplicatedKeys: [],
        },
        blockData,
      );

      expect(mockSendMessageFromGuardian).toHaveBeenCalledTimes(1);
      expect(mockSignDepositData).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFrontRunAttempts', () => {
    const pubkey = vettedKeys[0].key;
    const moduleWC = '0x12';
    const attackerWC = '0x23';
    const otherLidoWC = '0x34';
    const lidoWCSet = new Set([moduleWC, otherLidoWC]);

    const makeModuleData = () =>
      ({
        ...stakingModuleData,
        withdrawalCredentials: moduleWC,
        lastChangedBlockHash: '',
        vettedUnusedKeys: vettedKeys,
        isModuleDepositsPaused: false,
        invalidKeys: [],
        duplicatedKeys: [],
        crossTypeKeys: [],
        frontRunKeys: [],
        unresolvedDuplicatedKeys: [],
      } as any);

    const makeBlockData = (events: any[]) =>
      ({ depositedEvents: { events } } as any);

    it('should skip invalid deposit events', () => {
      const blockData = makeBlockData([
        { valid: false, pubkey, wc: attackerWC },
      ]);

      const { frontRunKeys, crossTypeKeys } =
        stakingModuleGuardService.getFrontRunAttempts(
          makeModuleData(),
          blockData,
          lidoWCSet,
        );

      expect(frontRunKeys).toHaveLength(0);
      expect(crossTypeKeys).toHaveLength(0);
    });

    it('should skip deposits with module WC', () => {
      const blockData = makeBlockData([{ valid: true, pubkey, wc: moduleWC }]);

      const { frontRunKeys, crossTypeKeys } =
        stakingModuleGuardService.getFrontRunAttempts(
          makeModuleData(),
          blockData,
          lidoWCSet,
        );

      expect(frontRunKeys).toHaveLength(0);
      expect(crossTypeKeys).toHaveLength(0);
    });

    it('should detect front-run with attacker WC', () => {
      const blockData = makeBlockData([
        { valid: true, pubkey, wc: attackerWC },
      ]);

      const { frontRunKeys, crossTypeKeys } =
        stakingModuleGuardService.getFrontRunAttempts(
          makeModuleData(),
          blockData,
          lidoWCSet,
        );

      expect(frontRunKeys).toHaveLength(1);
      expect(frontRunKeys[0].key).toBe(pubkey);
      expect(crossTypeKeys).toHaveLength(0);
    });

    it('should detect cross-type deposit with other Lido WC', () => {
      const blockData = makeBlockData([
        { valid: true, pubkey, wc: otherLidoWC },
      ]);

      const { frontRunKeys, crossTypeKeys } =
        stakingModuleGuardService.getFrontRunAttempts(
          makeModuleData(),
          blockData,
          lidoWCSet,
        );

      expect(frontRunKeys).toHaveLength(0);
      expect(crossTypeKeys).toHaveLength(1);
      expect(crossTypeKeys[0].key).toBe(pubkey);
    });
  });

  describe('checkHistoricalFrontRun', () => {
    const MODULE_ADDR_01 = '0xModuleAddr01';
    const MODULE_ADDR_02 = '0xModuleAddr02';
    const WC_01 =
      '0x010000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const WC_02 =
      '0x020000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const BAD_WC = '0xbadbadbadbad';

    const makeLidoKey = (
      key: string,
      moduleAddress: string,
      used: boolean,
    ) => ({
      key,
      depositSignature: '0xsig',
      operatorIndex: 0,
      used,
      index: 0,
      moduleAddress,
      vetted: true,
    });

    const makeEvent = (
      pubkey: string,
      wc: string,
      blockNumber: number,
      logIndex: number,
      valid = true,
    ) => ({
      pubkey,
      wc,
      blockNumber,
      logIndex,
      valid,
      amount: '32000000000',
      signature: '0xsig',
      tx: '0xtx',
      blockHash: '0xhash',
      depositCount: 1,
      depositDataRoot: new Uint8Array(),
      index: '',
    });

    it('should return false when earliest deposit has correct 0x01 WC', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        { events: [makeEvent('0xkey01', WC_01, 100, 0)] } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01 },
      );
      expect(result).toBe(false);
    });

    it('should return false when earliest deposit has correct 0x02 WC', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        { events: [makeEvent('0xkey02', WC_02, 100, 0)] } as any,
        [makeLidoKey('0xkey02', MODULE_ADDR_02, true)],
        { [MODULE_ADDR_02]: WC_02 },
      );
      expect(result).toBe(false);
    });

    it('should return false when lido 0x01 deposit is earlier than non-lido deposit', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        {
          events: [
            makeEvent('0xkey01', WC_01, 100, 0),
            makeEvent('0xkey01', BAD_WC, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01 },
      );
      expect(result).toBe(false);
    });

    it('should return false when lido 0x02 deposit is earlier than non-lido deposit', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        {
          events: [
            makeEvent('0xkey02', WC_02, 100, 0),
            makeEvent('0xkey02', BAD_WC, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey02', MODULE_ADDR_02, true)],
        { [MODULE_ADDR_02]: WC_02 },
      );
      expect(result).toBe(false);
    });

    it('should return true when non-lido deposit is earlier than lido 0x01 deposit (theft)', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        {
          events: [
            makeEvent('0xkey01', BAD_WC, 100, 0),
            makeEvent('0xkey01', WC_01, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01 },
      );
      expect(result).toBe(true);
    });

    it('should return true when non-lido deposit is earlier than lido 0x02 deposit (theft)', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        {
          events: [
            makeEvent('0xkey02', BAD_WC, 100, 0),
            makeEvent('0xkey02', WC_02, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey02', MODULE_ADDR_02, true)],
        { [MODULE_ADDR_02]: WC_02 },
      );
      expect(result).toBe(true);
    });

    it('should return false when invalid non-lido event is earlier than valid lido event', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        {
          events: [
            makeEvent('0xkey01', BAD_WC, 100, 0, false),
            makeEvent('0xkey01', WC_01, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01 },
      );
      expect(result).toBe(false);
    });

    it('should return false when lido deposit has lower logIndex in same block', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        {
          events: [
            makeEvent('0xkey01', WC_01, 100, 1),
            makeEvent('0xkey01', BAD_WC, 100, 5),
          ],
        } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01 },
      );
      expect(result).toBe(false);
    });

    it('should return true when non-lido deposit has lower logIndex in same block (theft)', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        {
          events: [
            makeEvent('0xkey01', BAD_WC, 100, 1),
            makeEvent('0xkey01', WC_01, 100, 5),
          ],
        } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01 },
      );
      expect(result).toBe(true);
    });

    it('should return false when earliest deposit has wrong WC type but is lido WC', () => {
      const result = stakingModuleGuardService.checkHistoricalFrontRun(
        { events: [makeEvent('0xkey01', WC_02, 100, 0)] } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01, [MODULE_ADDR_02]: WC_02 },
      );
      expect(result).toBe(false);
    });

    it('should throw when used key has unknown moduleAddress', () => {
      expect(() =>
        stakingModuleGuardService.checkHistoricalFrontRun(
          { events: [makeEvent('0xkey01', WC_01, 100, 0)] } as any,
          [makeLidoKey('0xkey01', '0xUnknownModule', true)],
          { [MODULE_ADDR_01]: WC_01 },
        ),
      ).toThrow('Unexpected module address');
    });
  });

  describe('checkWrongWCType', () => {
    const MODULE_ADDR_01 = '0xModuleAddr01';
    const MODULE_ADDR_02 = '0xModuleAddr02';
    const WC_01 =
      '0x010000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const WC_02 =
      '0x020000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const BAD_WC = '0xbadbadbadbad';

    const makeLidoKey = (
      key: string,
      moduleAddress: string,
      used: boolean,
    ) => ({
      key,
      depositSignature: '0xsig',
      operatorIndex: 0,
      used,
      index: 0,
      moduleAddress,
      vetted: true,
    });

    const makeEvent = (
      pubkey: string,
      wc: string,
      blockNumber: number,
      logIndex: number,
      valid = true,
    ) => ({
      pubkey,
      wc,
      blockNumber,
      logIndex,
      valid,
      amount: '32000000000',
      signature: '0xsig',
      tx: '0xtx',
      blockHash: '0xhash',
      depositCount: 1,
      depositDataRoot: new Uint8Array(),
      index: '',
    });

    it('should return false when earliest deposit has correct WC for module', () => {
      const result = stakingModuleGuardService.checkWrongWCType(
        {
          events: [
            makeEvent('0xkey01', WC_01, 100, 0),
            makeEvent('0xkey02', WC_02, 101, 0),
          ],
        } as any,
        [
          makeLidoKey('0xkey01', MODULE_ADDR_01, true),
          makeLidoKey('0xkey02', MODULE_ADDR_02, true),
        ],
        { [MODULE_ADDR_01]: WC_01, [MODULE_ADDR_02]: WC_02 },
      );
      expect(result).toBe(false);
    });

    it('should return true when 0x01 module key has earliest deposit with 0x02 WC', () => {
      const result = stakingModuleGuardService.checkWrongWCType(
        {
          events: [
            makeEvent('0xkey01', WC_02, 100, 0),
            makeEvent('0xkey01', WC_01, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01, [MODULE_ADDR_02]: WC_02 },
      );
      expect(result).toBe(true);
    });

    it('should return true when 0x02 module key has earliest deposit with 0x01 WC', () => {
      const result = stakingModuleGuardService.checkWrongWCType(
        {
          events: [
            makeEvent('0xkey02', WC_01, 100, 0),
            makeEvent('0xkey02', WC_02, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey02', MODULE_ADDR_02, true)],
        { [MODULE_ADDR_01]: WC_01, [MODULE_ADDR_02]: WC_02 },
      );
      expect(result).toBe(true);
    });

    it('should return false when earliest deposit has non-lido WC (front-run, not wrong type)', () => {
      const result = stakingModuleGuardService.checkWrongWCType(
        {
          events: [
            makeEvent('0xkey01', BAD_WC, 100, 0),
            makeEvent('0xkey01', WC_01, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01 },
      );
      expect(result).toBe(false);
    });

    it('should return false when invalid wrong-type event is earlier than valid correct event', () => {
      const result = stakingModuleGuardService.checkWrongWCType(
        {
          events: [
            makeEvent('0xkey01', WC_02, 100, 0, false),
            makeEvent('0xkey01', WC_01, 200, 0),
          ],
        } as any,
        [makeLidoKey('0xkey01', MODULE_ADDR_01, true)],
        { [MODULE_ADDR_01]: WC_01, [MODULE_ADDR_02]: WC_02 },
      );
      expect(result).toBe(false);
    });

    it('should throw when used key has unknown moduleAddress', () => {
      expect(() =>
        stakingModuleGuardService.checkWrongWCType(
          { events: [makeEvent('0xkey01', WC_01, 100, 0)] } as any,
          [makeLidoKey('0xkey01', '0xUnknownModule', true)],
          { [MODULE_ADDR_01]: WC_01 },
        ),
      ).toThrow('Unexpected module address');
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
