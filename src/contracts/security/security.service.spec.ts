import { isAddress } from '@ethersproject/address';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule, ProviderService } from 'provider';
import { WalletService } from 'wallet';
import { SecurityAbi__factory } from 'generated';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { Interface } from '@ethersproject/abi';
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

    await mockRepository(repositoryService);
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
      const nonce = 1;
      const blockNumber = 1;
      const blockHash = hexZeroPad('0x3', 32);
      const args = [
        depositRoot,
        nonce,
        blockNumber,
        blockHash,
        TEST_MODULE_ID,
      ] as const;

      const mockGetAttestMessagePrefix = jest
        .spyOn(securityService, 'getAttestMessagePrefix')
        .mockImplementation(async () => hexZeroPad('0x1', 32));

      const signDepositData = jest.spyOn(walletService, 'signDepositData');

      const signature = await securityService.signDepositData(...args);

      expect(mockGetAttestMessagePrefix).toBeCalledTimes(1);
      expect(signDepositData).toBeCalledWith({
        prefix,
        depositRoot,
        nonce,
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

  describe('signPauseDataV2', () => {
    it('should add prefix', async () => {
      const blockNumber = 1;
      const blockHash = '0x';

      const mockGetPauseMessagePrefix = jest
        .spyOn(securityService, 'getPauseMessagePrefix')
        .mockImplementation(async () => hexZeroPad('0x2', 32));

      const signPauseData = jest.spyOn(walletService, 'signPauseDataV2');

      const signature = await securityService.signPauseDataV2(
        blockNumber,
        blockHash,
        TEST_MODULE_ID,
      );
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(1);
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

  describe('signPauseDataV3', () => {
    it('should add prefix', async () => {
      const blockNumber = 1;
      const blockHash = '0x';

      const mockGetPauseMessagePrefix = jest
        .spyOn(securityService, 'getPauseMessagePrefix')
        .mockImplementation(async () => hexZeroPad('0x2', 32));

      const signPauseData = jest.spyOn(walletService, 'signPauseDataV3');

      const signature = await securityService.signPauseDataV3(
        blockNumber,
        blockHash,
      );
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(1);
      expect(signPauseData).toBeCalledWith({
        blockNumber: 1,
        prefix:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
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

  describe('pauseDepositsV2', () => {
    const hash = hexZeroPad('0x1', 32);
    const blockNumber = 10;
    const blockHash = '0x';

    let mockWait;
    let mockPauseDeposits;
    let mockGetPauseMessagePrefix;
    let mockGetContractWithSigner;
    let signature;

    beforeEach(async () => {
      mockWait = jest.fn().mockImplementation(async () => undefined);
      await mockRepository(repositoryService);
      mockGetPauseMessagePrefix = jest
        .spyOn(securityService, 'getPauseMessagePrefix')
        .mockImplementation(async () => hexZeroPad('0x2', 32));

      mockPauseDeposits = jest
        .fn()
        .mockImplementation(async () => ({ wait: mockWait, hash }));

      mockGetContractWithSigner = jest
        .spyOn(securityService, 'getContractWithSignerDeprecated')
        .mockImplementation(
          () => ({ pauseDeposits: mockPauseDeposits } as any),
        );

      signature = await securityService.signPauseDataV2(
        blockNumber,
        blockHash,
        TEST_MODULE_ID,
      );
    });

    it('should call contract method', async () => {
      await securityService.pauseDepositsV2(
        blockNumber,
        TEST_MODULE_ID,
        signature,
      );

      expect(mockPauseDeposits).toBeCalledTimes(1);
      expect(mockWait).toBeCalledTimes(1);
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(1);
      expect(mockGetContractWithSigner).toBeCalledTimes(1);
    });

    it('should exit if the previous call is not completed', async () => {
      await Promise.all([
        securityService.pauseDepositsV2(blockNumber, TEST_MODULE_ID, signature),
        securityService.pauseDepositsV2(blockNumber, TEST_MODULE_ID, signature),
      ]);

      expect(mockPauseDeposits).toBeCalledTimes(1);
      expect(mockWait).toBeCalledTimes(1);
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(1);
      expect(mockGetContractWithSigner).toBeCalledTimes(1);
    });
  });

  describe('pauseDepositsV3', () => {
    const hash = hexZeroPad('0x1', 32);
    const blockNumber = 10;
    const blockHash = '0x';

    let mockWait;
    let mockPauseDeposits;
    let mockGetPauseMessagePrefix;
    let mockGetContractWithSigner;
    let signature;

    beforeEach(async () => {
      mockWait = jest.fn().mockImplementation(async () => undefined);
      await mockRepository(repositoryService);
      mockGetPauseMessagePrefix = jest
        .spyOn(securityService, 'getPauseMessagePrefix')
        .mockImplementation(async () => hexZeroPad('0x2', 32));

      mockPauseDeposits = jest
        .fn()
        .mockImplementation(async () => ({ wait: mockWait, hash }));

      mockGetContractWithSigner = jest
        .spyOn(securityService, 'getContractWithSigner')
        .mockImplementation(
          () => ({ pauseDeposits: mockPauseDeposits } as any),
        );

      signature = await securityService.signPauseDataV3(blockNumber, blockHash);
    });

    it('should call contract method', async () => {
      await securityService.pauseDepositsV3(blockNumber, signature);

      expect(mockPauseDeposits).toBeCalledTimes(1);
      expect(mockWait).toBeCalledTimes(1);
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(1);
      expect(mockGetContractWithSigner).toBeCalledTimes(1);
    });

    it('should exit if the previous call is not completed', async () => {
      await Promise.all([
        securityService.pauseDepositsV3(blockNumber, signature),
        securityService.pauseDepositsV3(blockNumber, signature),
      ]);

      expect(mockPauseDeposits).toBeCalledTimes(1);
      expect(mockWait).toBeCalledTimes(1);
      expect(mockGetPauseMessagePrefix).toBeCalledTimes(1);
      expect(mockGetContractWithSigner).toBeCalledTimes(1);
    });
  });

  describe('signUnvetData', () => {
    it('should add prefix', async () => {
      const nonce = 1;
      const blockNumber = 10;
      const blockHash = hexZeroPad('0x3', 32);
      const stakingModuleId = 1;
      const operatorIds = '0x00000000000000010000000000000002';
      const vettedKeysByOperator =
        '0x0000000000000000000000000000000000000000000000000000000000000002';

      const mockGetUnvetMessagePrefix = jest
        .spyOn(securityService, 'getUnvetMessagePrefix')
        .mockImplementation(async () => hexZeroPad('0x2', 32));

      const signUnvetData = jest.spyOn(walletService, 'signUnvetData');

      const signature = await securityService.signUnvetData(
        nonce,
        blockNumber,
        blockHash,
        stakingModuleId,
        operatorIds,
        vettedKeysByOperator,
      );
      expect(mockGetUnvetMessagePrefix).toBeCalledTimes(1);
      expect(signUnvetData).toBeCalledWith({
        blockNumber,
        blockHash,
        stakingModuleId,
        nonce,
        operatorIds,
        vettedKeysByOperator,
        prefix:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
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

  describe('unvetSigningKeys', () => {
    const hash = hexZeroPad('0x1', 32);

    const nonce = 1;
    const blockNumber = 10;
    const blockHash = hexZeroPad('0x3', 32);
    const stakingModuleId = 1;
    const operatorIds = '0x00000000000000010000000000000002';
    const vettedKeysByOperator =
      '0x0000000000000000000000000000000000000000000000000000000000000002';

    let mockWait;
    let mockUnvetSigningKeys;
    let mockGetUnvetMessagePrefix;
    let mockGetContractWithSigner;
    let signature;

    beforeEach(async () => {
      mockWait = jest.fn().mockImplementation(async () => undefined);
      await mockRepository(repositoryService);
      mockGetUnvetMessagePrefix = jest
        .spyOn(securityService, 'getUnvetMessagePrefix')
        .mockImplementation(async () => hexZeroPad('0x2', 32));

      mockUnvetSigningKeys = jest
        .fn()
        .mockImplementation(async () => ({ wait: mockWait, hash }));

      mockGetContractWithSigner = jest
        .spyOn(securityService, 'getContractWithSigner')
        .mockImplementation(
          () => ({ unvetSigningKeys: mockUnvetSigningKeys } as any),
        );

      signature = await securityService.signUnvetData(
        nonce,
        blockNumber,
        blockHash,
        stakingModuleId,
        operatorIds,
        vettedKeysByOperator,
      );
    });

    it('should call contract method', async () => {
      await securityService.unvetSigningKeys(
        nonce,
        blockNumber,
        blockHash,
        stakingModuleId,
        operatorIds,
        vettedKeysByOperator,
        signature,
      );

      expect(mockUnvetSigningKeys).toBeCalledTimes(1);
      expect(mockWait).toBeCalledTimes(1);
      expect(mockGetUnvetMessagePrefix).toBeCalledTimes(1);
      expect(mockGetContractWithSigner).toBeCalledTimes(1);
    });

    it('should exit if the previous call is not completed', async () => {
      await Promise.all([
        securityService.unvetSigningKeys(
          nonce,
          blockNumber,
          blockHash,
          stakingModuleId,
          operatorIds,
          vettedKeysByOperator,
          signature,
        ),
        securityService.unvetSigningKeys(
          nonce,
          blockNumber,
          blockHash,
          stakingModuleId,
          operatorIds,
          vettedKeysByOperator,
          signature,
        ),
      ]);

      expect(mockUnvetSigningKeys).toBeCalledTimes(1);
      expect(mockWait).toBeCalledTimes(1);
      expect(mockGetUnvetMessagePrefix).toBeCalledTimes(1);
      expect(mockGetContractWithSigner).toBeCalledTimes(1);
    });
  });

  describe('messages prefixes', () => {
    const blockHash = '0x';

    beforeEach(async () => {
      jest
        .spyOn(repositoryService, 'getDepositAddress')
        .mockImplementation(async () => '0x' + '5'.repeat(40));
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

      const prefix = await securityService.getAttestMessagePrefix(blockHash);
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
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

      const prefix = await securityService.getPauseMessagePrefix(blockHash);
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });

    it('getUnvetMessagePrefix', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('UNVET_MESSAGE_PREFIX', result);
        });

      const prefix = await securityService.getUnvetMessagePrefix(blockHash);
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });
});
