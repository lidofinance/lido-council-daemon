import { Contract } from '@ethersproject/contracts';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { MockProviderModule } from 'provider';
import { RepositoryService } from 'contracts/repository';
import { RepositoryModule } from './repository.module';
import { LocatorService } from './locator/locator.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { mockLocator } from './locator/locator.mock';
import { mockRepository } from './repository.mock';

describe('RepositoryService', () => {
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
      ],
    }).compile();

    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);

    jest
      .spyOn(moduleRef.get(WINSTON_MODULE_NEST_PROVIDER), 'log')
      .mockImplementation(() => undefined);
  });

  describe('lido contract', () => {
    let mockGetAddress;

    beforeEach(async () => {
      mockGetAddress = mockLocator(locatorService).lidoAddr;
      await mockRepository(repositoryService);
    });

    it('should return contract instance', async () => {
      const contract = await repositoryService.getCachedLidoContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should call getLidoAddress once', async () => {
      await repositoryService.getCachedLidoContract();
      await repositoryService.getCachedLidoContract();
      expect(mockGetAddress).toBeCalledTimes(1);
    });

    it('should cache instance', async () => {
      const contract1 = await repositoryService.getCachedLidoContract();
      const contract2 = await repositoryService.getCachedLidoContract();
      expect(contract1).toEqual(contract2);
    });
  });

  describe('deposit security contract', () => {
    let mockGetAddress;

    beforeEach(async () => {
      mockGetAddress = mockLocator(locatorService).DSMAddr;
      await mockRepository(repositoryService);
    });

    it('should return contract instance', async () => {
      const contract = await repositoryService.getCachedDSMContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should call getDepositSecurityAddress once', async () => {
      await repositoryService.getCachedDSMContract();
      await repositoryService.getCachedDSMContract();
      expect(mockGetAddress).toBeCalledTimes(1);
    });

    it('should cache instance', async () => {
      const contract1 = await repositoryService.getCachedDSMContract();
      const contract2 = await repositoryService.getCachedDSMContract();
      expect(contract1).toEqual(contract2);
    });
  });

  describe('deposit contract', () => {
    let mockGetAddress;

    beforeEach(async () => {
      mockLocator(locatorService);
      mockGetAddress = await (
        await mockRepository(repositoryService)
      ).depositAddr;
    });

    it('should return contract instance', async () => {
      const contract = await repositoryService.getCachedDepositContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should call getDepositAddress once', async () => {
      await repositoryService.getCachedDepositContract();
      await repositoryService.getCachedDepositContract();
      expect(mockGetAddress).toBeCalledTimes(1);
    });

    it('should cache instance', async () => {
      const contract1 = await repositoryService.getCachedDepositContract();
      const contract2 = await repositoryService.getCachedDepositContract();
      expect(contract1).toEqual(contract2);
    });
  });

  describe('staking router', () => {
    let mockGetAddress;

    beforeEach(async () => {
      mockGetAddress = mockLocator(locatorService).SRAddr;
      await mockRepository(repositoryService);
    });

    it('should return contract instance', async () => {
      const contract = await repositoryService.getCachedStakingRouterContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should call getDepositAddress once and cache instance ', async () => {
      const contract1 =
        await repositoryService.getCachedStakingRouterContract();
      const contract2 =
        await repositoryService.getCachedStakingRouterContract();
      expect(mockGetAddress).toBeCalledTimes(1);

      expect(contract1).toEqual(contract2);
    });
  });
});
