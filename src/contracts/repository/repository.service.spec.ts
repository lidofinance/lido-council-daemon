import { Contract } from '@ethersproject/contracts';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { MockProviderModule } from 'provider';
import { RepositoryService } from 'contracts/repository';
import { RepositoryModule } from './repository.module';
import { LocatorService } from './locator/locator.service';

const mockLocator = (locator: LocatorService) => {
  const lidoAddr = jest
    .spyOn(locator, 'getLidoAddress')
    .mockImplementationOnce(async () => '0x' + '1'.repeat(40));

  const DSMAddr = jest
    .spyOn(locator, 'getDSMAddress')
    .mockImplementationOnce(async () => '0x' + '2'.repeat(40));
  const SRAddr = jest
    .spyOn(locator, 'getStakingRouterAddress')
    .mockImplementationOnce(async () => '0x' + '3'.repeat(40));
  const locatorAddr = jest
    .spyOn(locator, 'getLocatorAddress')
    .mockImplementationOnce(async () => '0x' + '4'.repeat(40));

  return { lidoAddr, locatorAddr, SRAddr, DSMAddr };
};

const mockRepository = async (repositoryService: RepositoryService) => {
  const address1 = '0x' + '5'.repeat(40);

  const depositAddr = jest
    .spyOn(repositoryService, 'getDepositAddress')
    .mockImplementationOnce(async () => address1);

  await repositoryService.initCachedContracts('latest');
  jest.spyOn(repositoryService, 'getCachedLidoContract');

  return { depositAddr };
};

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
});
