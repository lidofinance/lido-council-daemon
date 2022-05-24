import { Contract } from '@ethersproject/contracts';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { RepositoryService } from 'contracts/repository';
import { PrometheusModule } from 'common/prometheus';
import { RepositoryModule } from './repository.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';

describe('RepositoryService', () => {
  const address1 = '0x' + '1'.repeat(40);
  const address2 = '0x' + '0'.repeat(40);

  let repositoryService: RepositoryService;
  let loggerService: LoggerService;

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
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
  });

  describe('lido contract', () => {
    let mockGetAddress;

    beforeEach(() => {
      mockGetAddress = jest
        .spyOn(repositoryService, 'getLidoAddress')
        .mockImplementationOnce(async () => address1);
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

  describe('kernel contract', () => {
    let mockGetAddress;

    beforeEach(() => {
      mockGetAddress = jest
        .spyOn(repositoryService, 'getKernelAddress')
        .mockImplementationOnce(async () => address1);
    });

    it('should return contract instance', async () => {
      const contract = await repositoryService.getCachedKernelContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should call getKernelAddress once', async () => {
      await repositoryService.getCachedKernelContract();
      await repositoryService.getCachedKernelContract();
      expect(mockGetAddress).toBeCalledTimes(1);
    });

    it('should cache instance', async () => {
      const contract1 = await repositoryService.getCachedKernelContract();
      const contract2 = await repositoryService.getCachedKernelContract();
      expect(contract1).toEqual(contract2);
    });
  });

  describe('acl contract', () => {
    let mockGetAddress;

    beforeEach(() => {
      mockGetAddress = jest
        .spyOn(repositoryService, 'getACLAddress')
        .mockImplementationOnce(async () => address1);
    });

    it('should return contract instance', async () => {
      const contract = await repositoryService.getCachedACLContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should call getACLAddress once', async () => {
      await repositoryService.getCachedACLContract();
      await repositoryService.getCachedACLContract();
      expect(mockGetAddress).toBeCalledTimes(1);
    });

    it('should cache instance', async () => {
      const contract1 = await repositoryService.getCachedACLContract();
      const contract2 = await repositoryService.getCachedACLContract();
      expect(contract1).toEqual(contract2);
    });
  });

  describe('deposit security contract', () => {
    let mockGetAddress;

    beforeEach(() => {
      mockGetAddress = jest
        .spyOn(repositoryService, 'getDepositSecurityAddress')
        .mockImplementationOnce(async () => address1);
    });

    it('should return contract instance', async () => {
      const contract = await repositoryService.getCachedSecurityContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should call getDepositSecurityAddress once', async () => {
      await repositoryService.getCachedSecurityContract();
      await repositoryService.getCachedSecurityContract();
      expect(mockGetAddress).toBeCalledTimes(1);
    });

    it('should cache instance', async () => {
      const contract1 = await repositoryService.getCachedSecurityContract();
      const contract2 = await repositoryService.getCachedSecurityContract();
      expect(contract1).toEqual(contract2);
    });
  });

  describe('registry contract', () => {
    let mockGetAddress;

    beforeEach(() => {
      mockGetAddress = jest
        .spyOn(repositoryService, 'getRegistryAddress')
        .mockImplementationOnce(async () => address1);
    });

    it('should return contract instance', async () => {
      const contract = await repositoryService.getCachedRegistryContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should call getRegistryAddress once', async () => {
      await repositoryService.getCachedRegistryContract();
      await repositoryService.getCachedRegistryContract();
      expect(mockGetAddress).toBeCalledTimes(1);
    });

    it('should cache instance', async () => {
      const contract1 = await repositoryService.getCachedRegistryContract();
      const contract2 = await repositoryService.getCachedRegistryContract();
      expect(contract1).toEqual(contract2);
    });
  });

  describe('deposit contract', () => {
    let mockGetAddress;

    beforeEach(() => {
      mockGetAddress = jest
        .spyOn(repositoryService, 'getDepositAddress')
        .mockImplementationOnce(async () => address1);
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

  describe('update contracts', () => {
    const blockTag = 100;
    let mockKernelAddress;
    let mockACLAddress;
    let mockSecurityAddress;
    let mockRegistryAddress;
    let mockDepositAddress;

    beforeEach(() => {
      mockKernelAddress = jest
        .spyOn(repositoryService, 'getKernelAddress')
        .mockImplementation(async () => address1);

      mockACLAddress = jest
        .spyOn(repositoryService, 'getACLAddress')
        .mockImplementation(async () => address1);

      mockSecurityAddress = jest
        .spyOn(repositoryService, 'getDepositSecurityAddress')
        .mockImplementation(async () => address1);

      mockRegistryAddress = jest
        .spyOn(repositoryService, 'getRegistryAddress')
        .mockImplementation(async () => address1);

      mockDepositAddress = jest
        .spyOn(repositoryService, 'getDepositAddress')
        .mockImplementation(async () => address1);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should not update contracts if addresses are same', async () => {
      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeFalsy();

      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeFalsy();
    });

    it('should update contracts if security address has changed', async () => {
      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeFalsy();

      mockSecurityAddress.mockReset();
      mockSecurityAddress.mockImplementation(async () => address2);

      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeTruthy();

      const contract = await repositoryService.getCachedSecurityContract();
      expect(contract.address).toBe(address2);
    });

    it('should update contracts if security address has changed', async () => {
      const contract1 = await repositoryService.getCachedSecurityContract();
      const contract2 = await repositoryService.getCachedSecurityContract();

      mockSecurityAddress.mockReset();
      mockSecurityAddress.mockImplementation(async () => address2);

      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeTruthy();

      const contract3 = await repositoryService.getCachedSecurityContract();

      expect(contract1).toEqual(contract2);
      expect(contract2).not.toEqual(contract3);
    });

    it.skip('should update contracts if kernel address has changed', async () => {
      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeFalsy();

      mockKernelAddress.mockReset();
      mockKernelAddress.mockImplementation(async () => address2);

      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeTruthy();

      const contract = await repositoryService.getCachedKernelContract();
      expect(contract.address).toBe(address2);
    });

    it.skip('should update contracts if acl address has changed', async () => {
      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeFalsy();

      mockACLAddress.mockReset();
      mockACLAddress.mockImplementation(async () => address2);

      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeTruthy();

      const contract = await repositoryService.getCachedACLContract();
      expect(contract.address).toBe(address2);
    });

    it.skip('should update contracts if registry address has changed', async () => {
      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeFalsy();

      mockRegistryAddress.mockReset();
      mockRegistryAddress.mockImplementation(async () => address2);

      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeTruthy();

      const contract = await repositoryService.getCachedRegistryContract();
      expect(contract.address).toBe(address2);
    });

    it.skip('should update contracts if deposit address has changed', async () => {
      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeFalsy();

      mockDepositAddress.mockReset();
      mockDepositAddress.mockImplementation(async () => address2);

      await expect(
        repositoryService.updateContracts(blockTag),
      ).resolves.toBeTruthy();

      const contract = await repositoryService.getCachedDepositContract();
      expect(contract.address).toBe(address2);
    });
  });
});
