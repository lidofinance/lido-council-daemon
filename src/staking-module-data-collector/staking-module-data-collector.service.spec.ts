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
import { ethers } from 'ethers';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { CHAINS } from '@lido-nestjs/constants';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';

jest.mock('../transport/stomp/stomp.client');

const ONE_DEPOSIT = ethers.utils.parseEther('32');

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

  describe('collectStakingModuleData allocation check value', () => {
    let getDepositableEtherSpy: jest.SpyInstance;
    let getMaxDepositsSpy: jest.SpyInstance;

    beforeEach(() => {
      jest
        .spyOn(stakingRouterService, 'isModuleDepositsPaused')
        .mockResolvedValue(false);

      getMaxDepositsSpy = jest
        .spyOn(stakingRouterService, 'getStakingModuleMaxDepositsCount')
        .mockResolvedValue(1);

      getDepositableEtherSpy = jest.spyOn(
        stakingRouterService,
        'getDepositableEther',
      );
    });

    it('should use real depositableEther when greater than 32 ETH', async () => {
      const largeDepositable = ethers.utils.parseEther('320');
      getDepositableEtherSpy.mockResolvedValue(largeDepositable);

      await service.collectStakingModuleData({
        stakingModules: [mockModule] as any,
        meta: mockMeta as any,
        lidoKeys: [],
      });

      expect(getMaxDepositsSpy).toHaveBeenCalledWith(
        mockModule.id,
        largeDepositable,
        expect.anything(),
      );
    });

    it('should floor allocation check at 32 ETH when depositableEther < 32 ETH', async () => {
      const smallDepositable = ethers.utils.parseEther('10');
      getDepositableEtherSpy.mockResolvedValue(smallDepositable);

      await service.collectStakingModuleData({
        stakingModules: [mockModule] as any,
        meta: mockMeta as any,
        lidoKeys: [],
      });

      expect(getMaxDepositsSpy).toHaveBeenCalledWith(
        mockModule.id,
        ONE_DEPOSIT,
        expect.anything(),
      );
    });

    it('should use 32 ETH when depositableEther is exactly 32 ETH', async () => {
      getDepositableEtherSpy.mockResolvedValue(ONE_DEPOSIT);

      await service.collectStakingModuleData({
        stakingModules: [mockModule] as any,
        meta: mockMeta as any,
        lidoKeys: [],
      });

      expect(getMaxDepositsSpy).toHaveBeenCalledWith(
        mockModule.id,
        ONE_DEPOSIT,
        expect.anything(),
      );
    });
  });
});
