import { isAddress } from '@ethersproject/address';
import { Interface } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import { hexZeroPad } from '@ethersproject/bytes';
import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { MockProviderModule, ProviderService } from 'provider';
import { RepositoryService } from 'contracts/repository';
import { LidoAbi__factory } from 'generated';
import { RepositoryModule } from './repository.module';

describe('RepositoryService', () => {
  const address1 = '0x' + '1'.repeat(40);

  let repositoryService: RepositoryService;
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
    providerService = moduleRef.get(ProviderService);
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

  describe('lido address', () => {
    it('should return contract address for mainnet', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => CHAINS.Mainnet);

      const address = await repositoryService.getLidoAddress();
      expect(isAddress(address)).toBeTruthy();
    });

    it('should return contract address for goerli', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => CHAINS.Goerli);

      const address = await repositoryService.getLidoAddress();
      expect(isAddress(address)).toBeTruthy();
    });

    it('should throw an error for unknown network', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => 999);

      await expect(repositoryService.getLidoAddress()).rejects.toThrowError();
    });
  });

  describe('deposit security address', () => {
    it('should return contract address for mainnet', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => CHAINS.Mainnet);

      const address = await repositoryService.getDepositSecurityAddress();
      expect(isAddress(address)).toBeTruthy();
    });

    it('should return contract address for goerli', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => CHAINS.Goerli);

      const address = await repositoryService.getDepositSecurityAddress();
      expect(isAddress(address)).toBeTruthy();
    });

    it('should throw an error for unknown network', async () => {
      jest
        .spyOn(providerService, 'getChainId')
        .mockImplementationOnce(async () => 999);

      await expect(
        repositoryService.getDepositSecurityAddress(),
      ).rejects.toThrowError();
    });
  });

  describe('registry address', () => {
    it('should return contract address', async () => {
      const expected = hexZeroPad('0x1', 20);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(LidoAbi__factory.abi);
          return iface.encodeFunctionResult('getOperators', [expected]);
        });

      const address = await repositoryService.getRegistryAddress();
      expect(address).toEqual(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('deposit address', () => {
    it('should return contract address', async () => {
      const expected = hexZeroPad('0x1', 20);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(LidoAbi__factory.abi);
          return iface.encodeFunctionResult('getDepositContract', [expected]);
        });

      const address = await repositoryService.getDepositAddress();
      expect(address).toEqual(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });
});
