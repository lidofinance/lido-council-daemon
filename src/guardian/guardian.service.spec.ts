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

const vettedKeys = [
  {
    key: '0x9948d2becf42e9f76922bc6f664545e6f50401050af95785a984802d32a95c4c61f8e3de312b78167f86e047f83a7796',
    depositSignature:
      '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
    operatorIndex: 0,
    used: false,
    moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
    index: 100,
  },
  {
    key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
    depositSignature:
      '0x898ac7072aa26d983f9ece384c4037966dde614b75dddf982f6a415f3107cb2569b96f6d1c44e608a250ac4bbe908df51473f0de2cf732d283b07d88f3786893124967b8697a8b93d31976e7ac49ab1e568f98db0bbb13384477e8357b6d7e9b',
    operatorIndex: 0,
    used: false,
    moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
    index: 101,
  },
  {
    key: '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
    depositSignature:
      '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
    operatorIndex: 28,
    used: false,
    moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    index: 5,
  },
];

const vettedKeysResponse = {
  blockHash: 'some_hash',
  blockNumber: 1,
  vettedKeys,
  stakingModulesData: [
    {
      blockHash: 'some_hash',
      unusedKeys: [
        '0x9948d2becf42e9f76922bc6f664545e6f50401050af95785a984802d32a95c4c61f8e3de312b78167f86e047f83a7796',
        '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
      ],
      vettedKeys: [
        {
          key: '0x9948d2becf42e9f76922bc6f664545e6f50401050af95785a984802d32a95c4c61f8e3de312b78167f86e047f83a7796',
          depositSignature:
            '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
          operatorIndex: 0,
          used: false,
          moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
          index: 100,
        },
        {
          key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
          depositSignature:
            '0x898ac7072aa26d983f9ece384c4037966dde614b75dddf982f6a415f3107cb2569b96f6d1c44e608a250ac4bbe908df51473f0de2cf732d283b07d88f3786893124967b8697a8b93d31976e7ac49ab1e568f98db0bbb13384477e8357b6d7e9b',
          operatorIndex: 0,
          used: false,
          moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
          index: 101,
        },
      ],
      nonce: 0,
      stakingModuleId: 2,
      stakingModuleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
    },
    {
      blockHash: 'some_hash',
      unusedKeys: [
        '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
      ],
      vettedKeys: [
        {
          key: '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
          depositSignature:
            '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
          operatorIndex: 28,
          used: false,
          moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
          index: 5,
        },
      ],
      nonce: 0,
      stakingModuleId: 3,
      stakingModuleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    },
  ],
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
    jest
      .spyOn(stakingRouterService, 'getStakingModulesData')
      .mockImplementation(async () => vettedKeysResponse);

    const getBlockGuardServiceMock = jest
      .spyOn(blockGuardService, 'isNeedToProcessNewState')
      .mockImplementation(() => false);

    await Promise.all([
      guardianService.handleNewBlock(),
      guardianService.handleNewBlock(),
    ]);

    expect(getBlockGuardServiceMock).toBeCalledTimes(1);
  });
});
