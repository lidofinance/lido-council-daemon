import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { GuardianService } from './guardian.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { PrometheusModule } from 'common/prometheus';
import { GuardianModule } from 'guardian';
import { DepositModule } from 'contracts/deposit';
import { SecurityModule } from 'contracts/security';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { LidoModule } from 'contracts/lido';
import { MessagesModule } from 'messages';
import { StakingRouterModule, StakingRouterService } from 'staking-router';
import { GuardianMetricsModule } from './guardian-metrics';
import { GuardianMessageModule } from './guardian-message';
import { StakingModuleGuardModule } from './staking-module-guard';
import { BlockGuardModule, BlockGuardService } from './block-guard';
import { ScheduleModule } from 'common/schedule';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { mockRepository } from 'contracts/repository/repository.mock';

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
      exitedValidatorsCount: 0,
      active: true,
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
  let blockGuardService: BlockGuardService;

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
        DepositModule,
        SecurityModule,
        LidoModule,
        MessagesModule,
        StakingRouterModule,
        ScheduleModule,
        BlockGuardModule,
        StakingModuleGuardModule,
        GuardianMessageModule,
        GuardianMetricsModule,
      ],
    }).compile();

    stakingRouterService = moduleRef.get(StakingRouterService);
    blockGuardService = moduleRef.get(BlockGuardService);

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

  it('should exit if the previous call is not completed', async () => {
    const getStakingModulesMock = jest
      .spyOn(stakingRouterService, 'getStakingModules')
      .mockImplementation(async () => stakingModuleResponse);

    const getBlockGuardServiceMock = jest
      .spyOn(blockGuardService, 'isNeedToProcessNewState')
      .mockImplementation(() => false);

    await Promise.all([
      guardianService.handleNewBlock(),
      guardianService.handleNewBlock(),
    ]);

    expect(getStakingModulesMock).toBeCalledTimes(1);
    expect(getBlockGuardServiceMock).toBeCalledTimes(1);
  });
});
