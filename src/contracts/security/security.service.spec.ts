import { isAddress } from '@ethersproject/address';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { WalletService } from 'wallet';
import { SecurityAbi__factory, SecurityV5Abi__factory } from 'generated';
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
import { GuardianExecutionContext } from './security.service';

jest.mock('../../transport/stomp/stomp.client');

const TEST_MODULE_ID = 1;

describe('SecurityService', () => {
  const address1 = hexZeroPad('0x1', 20);
  const address2 = hexZeroPad('0x2', 20);
  const blockTag = { blockHash: hexZeroPad('0x4', 32) };
  const legacyContext: GuardianExecutionContext = {
    dsmAddress: address1,
    dsmVersion: 3,
    delegateAddress: address1,
    guardianAddress: address1,
    guardianIndex: 0,
    mode: 'legacy-eoa',
  };
  const edfContext: GuardianExecutionContext = {
    dsmAddress: address1,
    dsmVersion: 5,
    delegateAddress: address1,
    guardianAddress: address2,
    guardianIndex: 0,
    mode: 'edf',
  };

  let securityService: SecurityService;
  let provider: SimpleFallbackJsonRpcBatchProvider;
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
    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
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
        .spyOn(provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('getGuardians', result);
        });

      const guardians = await securityService.getGuardians();
      expect(guardians).toEqual(expected);
      expect(mockProviderCall).toHaveBeenCalledTimes(1);
    });
  });

  describe('getGuardianIndex', () => {
    it('should return guardian index', async () => {
      jest
        .spyOn(securityService, 'getGuardianExecutionContext')
        .mockResolvedValue(legacyContext);

      const guardianIndex = await securityService.getGuardianIndex();
      expect(guardianIndex).toEqual(0);
    });

    it('should return -1 if address is not in the list', async () => {
      jest
        .spyOn(securityService, 'getGuardianExecutionContext')
        .mockResolvedValue({ ...legacyContext, guardianIndex: -1 });

      const guardianIndex = await securityService.getGuardianIndex();
      expect(guardianIndex).toBe(-1);
    });
  });

  describe('getGuardianAddress', () => {
    it('should return guardian address', async () => {
      jest
        .spyOn(securityService, 'getGuardianExecutionContext')
        .mockResolvedValue(legacyContext);
      const guardianAddress = await securityService.getGuardianAddress(
        blockTag,
      );
      expect(isAddress(guardianAddress)).toBeTruthy();
    });
  });

  describe('version', () => {
    const mockContractVersion = (version: number) => {
      const VERSION = jest.fn().mockResolvedValue(BigNumber.from(version));

      jest.spyOn(securityService, 'getContractWithSigner').mockReturnValue({
        VERSION,
        address: address1,
      } as any);

      return VERSION;
    };

    it('should allow DSM v3', async () => {
      const VERSION = mockContractVersion(3);

      await expect(securityService.version(blockTag)).resolves.toBe(3);
      expect(VERSION).toHaveBeenCalledWith({ blockTag });
    });

    it('should allow DSM v4', async () => {
      const VERSION = mockContractVersion(4);

      await expect(securityService.version(blockTag)).resolves.toBe(4);
      expect(VERSION).toHaveBeenCalledWith({ blockTag });
    });

    it('should allow DSM v5', async () => {
      const VERSION = mockContractVersion(5);

      await expect(securityService.version(blockTag)).resolves.toBe(5);
      expect(VERSION).toHaveBeenCalledWith({ blockTag });
    });

    it('should reject unsupported DSM versions', async () => {
      mockContractVersion(6);

      await expect(securityService.version(blockTag)).rejects.toThrow(
        'Unsupported DSM contract version found: 6',
      );
      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unsupported DSM contract version found: 6',
        expect.objectContaining({
          dsmContractAddress: address1,
          blockTag,
          supportedVersions: [3, 4, 5],
        }),
      );
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
      const mockVersion = jest
        .spyOn(securityService, 'version')
        .mockImplementation(async () => 3);

      const signDepositData = jest.spyOn(walletService, 'signDepositData');

      const signature = await securityService.signDepositData(
        ...args,
        legacyContext,
      );

      expect(mockGetAttestMessagePrefix).toHaveBeenCalledTimes(1);
      expect(mockVersion).not.toHaveBeenCalled();
      expect(signDepositData).toBeCalledWith({
        prefix,
        depositRoot,
        nonce,
        blockNumber,
        blockHash,
        stakingModuleId: TEST_MODULE_ID,
        dsmVersion: 3,
        guardianAddress: address1,
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
      const blockHash = '0x';

      const mockGetPauseMessagePrefix = jest
        .spyOn(securityService, 'getPauseMessagePrefix')
        .mockImplementation(async () => hexZeroPad('0x2', 32));
      const mockVersion = jest
        .spyOn(securityService, 'version')
        .mockImplementation(async () => 3);

      const signPauseData = jest.spyOn(walletService, 'signPauseData');

      const signature = await securityService.signPauseData(
        blockNumber,
        blockHash,
        legacyContext,
      );
      expect(mockGetPauseMessagePrefix).toHaveBeenCalledTimes(1);
      expect(mockVersion).not.toHaveBeenCalled();
      expect(signPauseData).toBeCalledWith({
        blockNumber: 1,
        prefix:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
        dsmVersion: 3,
        guardianAddress: address1,
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

  describe('pauseDeposits', () => {
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
      jest.spyOn(securityService, 'version').mockImplementation(async () => 3);

      mockPauseDeposits = jest
        .fn()
        .mockImplementation(async () => ({ wait: mockWait, hash }));

      mockGetContractWithSigner = jest
        .spyOn(securityService, 'getContractWithSigner')
        .mockImplementation(
          () => ({ pauseDeposits: mockPauseDeposits } as any),
        );

      signature = await securityService.signPauseData(
        blockNumber,
        blockHash,
        legacyContext,
      );
    });

    it('should call contract method', async () => {
      await securityService.pauseDeposits(
        blockNumber,
        signature,
        legacyContext,
      );

      expect(mockPauseDeposits).toHaveBeenCalledTimes(1);
      expect(mockWait).toHaveBeenCalledTimes(1);
      expect(mockGetPauseMessagePrefix).toHaveBeenCalledTimes(1);
      expect(mockGetContractWithSigner).toHaveBeenCalledTimes(1);
    });

    it('should exit if the previous call is not completed', async () => {
      await Promise.all([
        securityService.pauseDeposits(blockNumber, signature, legacyContext),
        securityService.pauseDeposits(blockNumber, signature, legacyContext),
      ]);

      expect(mockPauseDeposits).toHaveBeenCalledTimes(1);
      expect(mockWait).toHaveBeenCalledTimes(1);
      expect(mockGetPauseMessagePrefix).toHaveBeenCalledTimes(1);
      expect(mockGetContractWithSigner).toHaveBeenCalledTimes(1);
    });
  });

  describe('EDF execution routing', () => {
    const hash = hexZeroPad('0x1', 32);
    const blockHash = hexZeroPad('0x3', 32);

    beforeEach(() => {
      jest
        .spyOn(walletService, 'selectDelegateWallet')
        .mockImplementation(() => undefined);
    });

    it('should route DSM v5 pause through DelegationContract.execute', async () => {
      const wait = jest.fn().mockResolvedValue(undefined);
      const execute = jest
        .fn()
        .mockResolvedValue({ wait, hash } as unknown as never);
      jest
        .spyOn(securityService, 'getDelegationContractWithSigner')
        .mockReturnValue({ execute } as any);

      await securityService.pauseDeposits(
        10,
        walletService.signMessage(hash),
        edfContext,
      );

      const expectedCalldata =
        SecurityV5Abi__factory.createInterface().encodeFunctionData(
          'pauseDeposits',
          [
            10,
            {
              guardian: hexZeroPad('0x0', 20),
              signature: '0x',
            },
          ],
        );
      expect(execute).toHaveBeenCalledWith(address1, expectedCalldata, {
        value: 0,
      });
      expect(wait).toHaveBeenCalledTimes(1);
    });

    it('should route DSM v5 unvet through DelegationContract.execute', async () => {
      const wait = jest.fn().mockResolvedValue(undefined);
      const execute = jest
        .fn()
        .mockResolvedValue({ wait, hash } as unknown as never);
      jest
        .spyOn(securityService, 'getDelegationContractWithSigner')
        .mockReturnValue({ execute } as any);
      const operatorIds = '0x0000000000000001';
      const vettedKeysByOperator = '0x00000000000000000000000000000002';

      await securityService.unvetSigningKeys(
        1,
        10,
        blockHash,
        1,
        operatorIds,
        vettedKeysByOperator,
        walletService.signMessage(hash),
        edfContext,
      );

      const expectedCalldata =
        SecurityV5Abi__factory.createInterface().encodeFunctionData(
          'unvetSigningKeys',
          [
            10,
            blockHash,
            1,
            1,
            operatorIds,
            vettedKeysByOperator,
            {
              guardian: hexZeroPad('0x0', 20),
              signature: '0x',
            },
          ],
        );
      expect(execute).toHaveBeenCalledWith(address1, expectedCalldata, {
        value: 0,
      });
      expect(wait).toHaveBeenCalledTimes(1);
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
      const mockVersion = jest
        .spyOn(securityService, 'version')
        .mockImplementation(async () => 3);

      const signUnvetData = jest.spyOn(walletService, 'signUnvetData');

      const signature = await securityService.signUnvetData(
        nonce,
        blockNumber,
        blockHash,
        stakingModuleId,
        operatorIds,
        vettedKeysByOperator,
        legacyContext,
      );
      expect(mockGetUnvetMessagePrefix).toHaveBeenCalledTimes(1);
      expect(mockVersion).not.toHaveBeenCalled();
      expect(signUnvetData).toBeCalledWith({
        blockNumber,
        blockHash,
        stakingModuleId,
        nonce,
        operatorIds,
        vettedKeysByOperator,
        prefix:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
        dsmVersion: 3,
        guardianAddress: address1,
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
        legacyContext,
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
        legacyContext,
      );

      expect(mockUnvetSigningKeys).toHaveBeenCalledTimes(1);
      expect(mockWait).toHaveBeenCalledTimes(1);
      expect(mockGetUnvetMessagePrefix).toHaveBeenCalledTimes(1);
      expect(mockGetContractWithSigner).toHaveBeenCalledTimes(1);
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
          legacyContext,
        ),
        securityService.unvetSigningKeys(
          nonce,
          blockNumber,
          blockHash,
          stakingModuleId,
          operatorIds,
          vettedKeysByOperator,
          signature,
          legacyContext,
        ),
      ]);

      expect(mockUnvetSigningKeys).toHaveBeenCalledTimes(1);
      expect(mockWait).toHaveBeenCalledTimes(1);
      expect(mockGetUnvetMessagePrefix).toHaveBeenCalledTimes(1);
      expect(mockGetContractWithSigner).toHaveBeenCalledTimes(1);
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
        .spyOn(provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('ATTEST_MESSAGE_PREFIX', result);
        });

      const prefix = await securityService.getAttestMessagePrefix(blockHash);
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toHaveBeenCalledTimes(1);
    });

    it('getPauseMessagePrefix', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('PAUSE_MESSAGE_PREFIX', result);
        });

      const prefix = await securityService.getPauseMessagePrefix(blockHash);
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toHaveBeenCalledTimes(1);
    });

    it('getUnvetMessagePrefix', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('UNVET_MESSAGE_PREFIX', result);
        });

      const prefix = await securityService.getUnvetMessagePrefix(blockHash);
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toHaveBeenCalledTimes(1);
    });
  });
});
