import { Contract } from '@ethersproject/contracts';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { MockProviderModule, ProviderService } from 'provider';
import { RepositoryService } from 'contracts/repository';
import { RepositoryModule } from './repository.module';
import { LocatorService } from './locator/locator.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { mockLocator } from './locator/locator.mock';
import { mockRepository } from './repository.mock';
import { SecurityAbi__factory } from 'generated';
import { Interface } from '@ethersproject/abi';

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

  describe('messages prefixes', () => {
    let repositoryService: RepositoryService;
    let locatorService: LocatorService;
    let providerService: ProviderService;

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
      providerService = moduleRef.get(ProviderService);
      jest
        .spyOn(moduleRef.get(WINSTON_MODULE_NEST_PROVIDER), 'log')
        .mockImplementation(() => undefined);
    });

    it('getAttestMessagePrefix', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('ATTEST_MESSAGE_PREFIX', result);
        });
      const depositAddr = jest
        .spyOn(repositoryService, 'getDepositAddress')
        .mockImplementation(async () => '0x' + '5'.repeat(40));

      mockLocator(locatorService);

      await repositoryService.initCachedContracts('latest');
      const prefix = await repositoryService.getAttestMessagePrefix();
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(2);
    });

    it('getPauseMessagePrefix', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('PAUSE_MESSAGE_PREFIX', result);
        });
      const depositAddr = jest
        .spyOn(repositoryService, 'getDepositAddress')
        .mockImplementation(async () => '0x' + '5'.repeat(40));

      mockLocator(locatorService);

      await repositoryService.initCachedContracts('latest');
      const prefix = await repositoryService.getPauseMessagePrefix();
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(2);
    });
  });
});
