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
    // OneAtTime test
    const getOperatorsAndModulesMock = jest
      .spyOn(stakingRouterService, 'getOperatorsAndModules')
      .mockImplementation(async () => ({
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

    const getBlockGuardServiceMock = jest
      .spyOn(blockGuardService, 'isNeedToProcessNewState')
      .mockImplementation(() => false);

    // run concurrently and check that second attempt
    await Promise.all([
      guardianService.handleNewBlock(),
      guardianService.handleNewBlock(),
    ]);

    expect(getBlockGuardServiceMock).toBeCalledTimes(1);
    expect(getOperatorsAndModulesMock).toBeCalledTimes(1);
  });
});
