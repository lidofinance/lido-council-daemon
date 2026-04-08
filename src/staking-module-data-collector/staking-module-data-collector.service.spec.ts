import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { ConfigModule } from 'common/config';
import { MockProviderModule } from 'provider';
import { PrometheusModule } from 'common/prometheus';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { StakingRouterService } from 'contracts/staking-router';
import { StakingModuleDataCollectorService } from './staking-module-data-collector.service';
import { StakingModuleDataCollectorModule } from './staking-module-data-collector.module';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { mockRepository } from 'contracts/repository/repository.mock';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { CHAINS } from '@lido-nestjs/constants';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';

jest.mock('../transport/stomp/stomp.client');

const mockMeta = {
  blockNumber: 100,
  blockHash: '0xabcdef',
  timestamp: 1000,
  lastChangedBlockHash: '0x123456',
};

const mockModule = {
  id: 1,
  nonce: 5,
  stakingModuleAddress: '0xmodule1',
};

describe('StakingModuleDataCollectorService', () => {
  let service: StakingModuleDataCollectorService;
  let stakingRouterService: StakingRouterService;
  let repositoryService: RepositoryService;
  let locatorService: LocatorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        RepositoryModule,
        StakingModuleDataCollectorModule,
      ],
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

    service = moduleRef.get(StakingModuleDataCollectorService);
    stakingRouterService = moduleRef.get(StakingRouterService);
    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);

    mockLocator(locatorService);
    await mockRepository(repositoryService);
  });

  describe('collectStakingModuleData', () => {
    it('should collect staking module data', async () => {
      jest
        .spyOn(stakingRouterService, 'isModuleDepositsPaused')
        .mockResolvedValue(false);

      const result = await service.collectStakingModuleData({
        stakingModules: [mockModule] as any,
        meta: mockMeta as any,
        lidoKeys: [],
        moduleWCMap: { '0xmodule1': '0xwc1' },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        stakingModuleId: mockModule.id,
        stakingModuleAddress: mockModule.stakingModuleAddress,
        nonce: mockModule.nonce,
        blockHash: mockMeta.blockHash,
        isModuleDepositsPaused: false,
        withdrawalCredentials: '0xwc1',
      });
    });
  });
});
