import { isAddress } from '@ethersproject/address';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule, ProviderService } from 'provider';
import { WalletService } from 'wallet';
import { SecurityAbi__factory, StakingRouterAbi__factory } from 'generated';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { Interface } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { hexZeroPad } from '@ethersproject/bytes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { PrometheusModule } from 'common/prometheus';
import { SecurityService } from './security.service';
import { SecurityModule } from './security.module';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { mockRepository } from 'contracts/repository/repository.mock';

jest.mock('../../transport/stomp/stomp.client');

const TEST_MODULE_ID = 1;

describe('SecurityService', () => {
  const address1 = hexZeroPad('0x1', 20);
  const address2 = hexZeroPad('0x2', 20);
  const address3 = hexZeroPad('0x3', 20);

  let securityService: SecurityService;
  let providerService: ProviderService;
  let repositoryService: RepositoryService;
  let walletService: WalletService;
  let loggerService: LoggerService;
  let mockGetAttestMessagePrefix: jest.SpyInstance<Promise<string>, []>;
  let mockGetPauseMessagePrefix: jest.SpyInstance<Promise<string>, []>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        SecurityModule,
        RepositoryModule,
      ],
    }).compile();

    securityService = moduleRef.get(SecurityService);
    providerService = moduleRef.get(ProviderService);
    repositoryService = moduleRef.get(RepositoryService);
    walletService = moduleRef.get(WalletService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);

    mockLocator(moduleRef.get(LocatorService));

    const repo = await mockRepository(repositoryService);
    mockGetAttestMessagePrefix = repo.mockGetAttestMessagePrefix;
    mockGetPauseMessagePrefix = repo.mockGetPauseMessagePrefix;
  });

  describe('getMaxDeposits', () => {
    it('should return max deposits', async () => {
      const expected = 10;

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [BigNumber.from(expected).toHexString()];
          return iface.encodeFunctionResult('getMaxDeposits', result);
        });

      const maxDeposits = await securityService.getMaxDeposits();
      expect(typeof maxDeposits).toBe('number');
      expect(maxDeposits).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('getGuardians', () => {
    it('should return guardians', async () => {
      const expected = [address1, address2];

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('getGuardians', result);
        });

      const guardians = await securityService.getGuardians();
      expect(guardians).toEqual(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('getGuardianIndex', () => {
    beforeEach(() => {
      const guardians = [address1, address2];

      jest
        .spyOn(securityService, 'getGuardians')
        .mockImplementation(async () => guardians);
    });

    it('should return guardian index', async () => {
      jest
        .spyOn(walletService, 'address', 'get')
        .mockImplementation(() => address1);

      const guardianIndex = await securityService.getGuardianIndex();
      expect(guardianIndex).toEqual(0);
    });

    it('should return -1 if address is not in the list', async () => {
      jest
        .spyOn(walletService, 'address', 'get')
        .mockImplementation(() => address3);

      const guardianIndex = await securityService.getGuardianIndex();
      expect(guardianIndex).toBe(-1);
    });
  });

  describe('getGuardianAddress', () => {
    it('should return guardian address', async () => {
      const guardianAddress = await securityService.getGuardianAddress();
      expect(isAddress(guardianAddress)).toBeTruthy();
    });
  });

  describe('signDepositData', () => {
    it('should add prefix', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const depositRoot = hexZeroPad('0x2', 32);
      const keysOpIndex = 1;
      const blockNumber = 1;
      const blockHash = hexZeroPad('0x3', 32);
      const args = [
        depositRoot,
        keysOpIndex,
        blockNumber,
        blockHash,
        TEST_MODULE_ID,
      ] as const;

      const signDepositData = jest.spyOn(walletService, 'signDepositData');

      const signature = await securityService.signDepositData(...args);
      // 1 — repository, 2 — signDepositData
      expect(mockGetAttestMessagePrefix).toBeCalledTimes(2);
      expect(signDepositData).toBeCalledWith({
        prefix,
        depositRoot,
        keysOpIndex,
        blockNumber,
        blockHash,
        stakingModuleId: TEST_MODULE_ID,
      });
      expect(signature).toEqual(
        expect.objectContaining({
          _vs: expect.any(String),
          r: expect.any(String),
          s: expect.any(String),
          v: expect.any(Number),
        }),
      );
    });
  });

  describe('signPauseData', () => {
    it('should add prefix', async () => {
      const blockNumber = 1;

      const signPauseData = jest.spyOn(walletService, 'signPauseData');

      const signature = await securityService.signPauseData(
        blockNumber,
        TEST_MODULE_ID,
      );
      // 1 — repository, 2 — signDepositData
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(2);
      expect(signPauseData).toBeCalledWith({
        blockNumber: 1,
        prefix:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
        stakingModuleId: 1,
      });
      expect(signature).toEqual(
        expect.objectContaining({
          _vs: expect.any(String),
          r: expect.any(String),
          s: expect.any(String),
          v: expect.any(Number),
        }),
      );
    });
  });

  describe('isDepositsPaused', () => {
    it('should call contract method', async () => {
      const expected = true;

      const mockProviderCalla = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(StakingRouterAbi__factory.abi);
          return iface.encodeFunctionResult('getStakingModuleIsActive', [
            expected,
          ]);
        });

      const isPaused = await securityService.isModuleDepositsPaused(
        TEST_MODULE_ID,
      );
      expect(isPaused).toBe(!expected);
      expect(mockProviderCalla).toBeCalledTimes(1);
    });
  });

  describe('pauseDeposits', () => {
    const hash = hexZeroPad('0x1', 32);
    const blockNumber = 10;

    let mockWait;
    let mockPauseDeposits;
    let mockGetPauseMessagePrefix;
    let mockGetContractWithSigner;
    let signature;

    beforeEach(async () => {
      mockWait = jest.fn().mockImplementation(async () => undefined);
      const repo = await mockRepository(repositoryService);
      mockGetPauseMessagePrefix = repo.mockGetPauseMessagePrefix;

      mockPauseDeposits = jest
        .fn()
        .mockImplementation(async () => ({ wait: mockWait, hash }));

      mockGetContractWithSigner = jest
        .spyOn(securityService, 'getContractWithSigner')
        .mockImplementation(
          async () => ({ pauseDeposits: mockPauseDeposits } as any),
        );

      signature = await securityService.signPauseData(
        blockNumber,
        TEST_MODULE_ID,
      );
    });

    it('should call contract method', async () => {
      await securityService.pauseDeposits(
        blockNumber,
        TEST_MODULE_ID,
        signature,
      );

      expect(mockPauseDeposits).toBeCalledTimes(1);
      expect(mockWait).toBeCalledTimes(1);
      // mockGetPauseMessagePrefix calls 3 times because
      // we have more than one call under the hood
      // 1 - repository, 2 — signPauseData, 3 — pauseDeposits
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(3);
      expect(mockGetContractWithSigner).toBeCalledTimes(1);
    });

    it('should exit if the previous call is not completed', async () => {
      await Promise.all([
        securityService.pauseDeposits(blockNumber, TEST_MODULE_ID, signature),
        securityService.pauseDeposits(blockNumber, TEST_MODULE_ID, signature),
      ]);

      expect(mockPauseDeposits).toBeCalledTimes(1);
      expect(mockWait).toBeCalledTimes(1);
      // mockGetPauseMessagePrefix calls 3 times because
      // we have more than one call under the hood
      // 1 - repository, 2 — signPauseData, 3 — pauseDeposits
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(3);
      expect(mockGetContractWithSigner).toBeCalledTimes(1);
    });
  });
});
