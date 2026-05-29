import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { DATA_BUS_PROVIDER_TOKEN, MockProviderModule } from 'provider';
import { GuardianService } from './guardian.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';
import { DepositsRegistryModule } from 'contracts/deposits-registry';
import { SecurityModule } from 'contracts/security';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { MessagesModule } from 'messages';
import { StakingModuleDataCollectorModule } from 'staking-module-data-collector';
import { GuardianMetricsModule } from './guardian-metrics';
import { GuardianMessageModule } from './guardian-message';
import { StakingModuleGuardModule } from './staking-module-guard';
import { BlockDataCollectorModule } from './block-data-collector';
import { ScheduleModule } from 'common/schedule';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { mockRepository } from 'contracts/repository/repository.mock';
import { KeysApiService } from 'keys-api/keys-api.service';
import { UnvettingModule } from './unvetting/unvetting.module';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { CHAINS } from '@lido-nestjs/constants';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';

jest.mock('../transport/stomp/stomp.client');

describe('GuardianService', () => {
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let loggerService: LoggerService;

  let repositoryService: RepositoryService;
  let locatorService: LocatorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        GuardianModule,
        RepositoryModule,
        DepositsRegistryModule.register('latest'),
        SecurityModule,
        MessagesModule,
        StakingModuleDataCollectorModule,
        ScheduleModule,
        BlockDataCollectorModule,
        StakingModuleGuardModule,
        GuardianMessageModule,
        GuardianMetricsModule,
        UnvettingModule,
      ],
    })
      .overrideProvider(DATA_BUS_PROVIDER_TOKEN)
      .useValue({
        getNetwork: jest.fn(),
      })
      .overrideProvider(SimpleFallbackJsonRpcBatchProvider)
      .useValue(new JsonRpcProvider('http://localhost:8545'))
      .compile();

    const provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);

    jest
      .spyOn(provider, 'detectNetwork')
      .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

    jest.spyOn(provider, 'getNetwork').mockImplementation(async () => ({
      chainId: CHAINS.Mainnet,
      name: 'mainnet',
    }));

    keysApiService = moduleRef.get(KeysApiService);

    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);

    guardianService = moduleRef.get(GuardianService);

    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);

    mockLocator(locatorService);
    await mockRepository(repositoryService);
  });

  describe('ignoreDeposits', () => {
    const makeModuleData = (overrides = {}) => ({
      blockHash: '0x1234',
      vettedUnusedKeys: [],
      nonce: 1,
      stakingModuleId: 1,
      stakingModuleAddress: '0x1',
      lastChangedBlockHash: '0x1',
      duplicatedKeys: [],
      invalidKeys: [],
      frontRunKeys: [],
      crossTypeKeys: [],
      unresolvedDuplicatedKeys: [],
      isModuleDepositsPaused: false,
      ...overrides,
    });

    const ignoreDeposits = ({
      moduleData = {},
      hasFrontRunning = false,
      hasWrongWCType = false,
      alreadyPausedDeposits = false,
      isDepositBlockedByAllocation = false,
    }: {
      moduleData?: Record<string, unknown>;
      hasFrontRunning?: boolean;
      hasWrongWCType?: boolean;
      alreadyPausedDeposits?: boolean;
      isDepositBlockedByAllocation?: boolean;
    } = {}) =>
      (guardianService as any).ignoreDeposits(
        makeModuleData(moduleData),
        hasFrontRunning,
        hasWrongWCType,
        alreadyPausedDeposits,
        1,
        isDepositBlockedByAllocation,
      );

    it('should not ignore deposits when no issues found', () => {
      const result = ignoreDeposits();
      expect(result).toBe(false);
    });

    it('should ignore deposits when DSM allocation policy blocks module', () => {
      const result = ignoreDeposits({ isDepositBlockedByAllocation: true });
      expect(result).toBe(true);
    });

    it('should ignore deposits when module is paused', () => {
      const result = ignoreDeposits({
        moduleData: {
          isModuleDepositsPaused: true,
        },
      });
      expect(result).toBe(true);
    });

    it('should ignore deposits when hasFrontRunning is true', () => {
      const result = ignoreDeposits({ hasFrontRunning: true });
      expect(result).toBe(true);
    });

    it('should ignore deposits when hasWrongWCType is true', () => {
      const result = ignoreDeposits({ hasWrongWCType: true });
      expect(result).toBe(true);
    });

    it('should ignore deposits when alreadyPausedDeposits is true', () => {
      const result = ignoreDeposits({ alreadyPausedDeposits: true });
      expect(result).toBe(true);
    });

    it('should ignore deposits when there are invalid keys', () => {
      const result = ignoreDeposits({
        moduleData: { invalidKeys: [{ key: '0xk' }] },
      });
      expect(result).toBe(true);
    });

    it('should ignore deposits when there are front-run keys', () => {
      const result = ignoreDeposits({
        moduleData: { frontRunKeys: [{ key: '0xk' }] },
      });
      expect(result).toBe(true);
    });

    it('should ignore deposits when there are duplicated keys', () => {
      const result = ignoreDeposits({
        moduleData: { duplicatedKeys: [{ key: '0xk' }] },
      });
      expect(result).toBe(true);
    });

    it('should ignore deposits when there are cross-type keys', () => {
      const result = ignoreDeposits({
        moduleData: { crossTypeKeys: [{ key: '0xk' }] },
      });
      expect(result).toBe(true);
    });

    it('should ignore deposits when there are unresolved duplicated keys', () => {
      const result = ignoreDeposits({
        moduleData: { unresolvedDuplicatedKeys: [{ key: '0xk' }] },
      });
      expect(result).toBe(true);
    });
  });

  it('should exit if the previous call is not completed', async () => {
    // OneAtTime test
    const getOperatorsAndModulesMock = jest
      .spyOn(keysApiService, 'getModules')
      .mockImplementation(async () => ({
        data: [],
        elBlockSnapshot: {
          blockNumber: 0,
          blockHash: 'string',
          timestamp: 0,
          lastChangedBlockHash: '',
        },
      }));

    jest.spyOn(keysApiService, 'getKeys').mockImplementation(async () => ({
      data: [],
      meta: {
        elBlockSnapshot: {
          blockNumber: 0,
          blockHash: 'string',
          timestamp: 0,
          lastChangedBlockHash: '',
        },
      },
    }));

    const isNeedToProcessNewStatMock = jest
      .spyOn(guardianService, 'isNeedToProcessNewState')
      .mockImplementation(() => false);

    // run concurrently and check that second attempt
    await Promise.all([
      guardianService.handleNewBlock(),
      guardianService.handleNewBlock(),
    ]);

    expect(isNeedToProcessNewStatMock).toHaveBeenCalledTimes(1);
    expect(getOperatorsAndModulesMock).toHaveBeenCalledTimes(1);
  });
});
