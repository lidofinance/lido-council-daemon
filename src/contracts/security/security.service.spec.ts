import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { WalletService } from 'wallet';
import {
  DelegationContractAbi__factory,
  SecurityAbi__factory,
  SecurityV5Abi__factory,
} from 'generated';
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
    dsmVersion: 4,
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

  describe('version', () => {
    const mockContractVersion = (version: number) => {
      const VERSION = jest.fn().mockResolvedValue(BigNumber.from(version));

      jest.spyOn(securityService, 'getContractWithSigner').mockReturnValue({
        VERSION,
        address: address1,
      } as any);

      return VERSION;
    };

    it('should reject DSM v3', async () => {
      mockContractVersion(3);

      await expect(securityService.version(blockTag)).rejects.toThrow(
        'Unsupported DSM contract version found: 3',
      );
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
          supportedVersions: [4, 5],
        }),
      );
    });
  });

  describe('initialize', () => {
    it('should start EDF preflight and return the guardian context', async () => {
      let finishPreflight: () => void = () => undefined;
      const preflight = new Promise<void>((resolve) => {
        finishPreflight = resolve;
      });
      const logEdfReadiness = jest
        .spyOn(securityService, 'logEdfReadiness')
        .mockReturnValue(preflight);
      const getGuardianExecutionContext = jest
        .spyOn(securityService, 'getGuardianExecutionContext')
        .mockResolvedValue(legacyContext);
      const monitorGuardianBalance = jest
        .spyOn(walletService, 'monitorGuardianBalance')
        .mockResolvedValue(undefined);

      const initialization = securityService.initialize(blockTag);

      expect(logEdfReadiness).toHaveBeenCalledWith(blockTag);
      expect(getGuardianExecutionContext).toHaveBeenCalledWith(blockTag);

      finishPreflight();
      await expect(initialization).resolves.toBe(legacyContext);
      await preflight;
      expect(monitorGuardianBalance).toHaveBeenCalledTimes(1);
    });
  });

  describe('logEdfReadiness', () => {
    const delegationAddress = hexZeroPad('0x5', 20);

    beforeEach(() => {
      jest
        .spyOn(walletService, 'addresses', 'get')
        .mockReturnValue([address1, address2]);
    });

    it('should report missing configuration without throwing', async () => {
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS = '';

      await expect(
        securityService.logEdfReadiness(blockTag),
      ).resolves.toBeUndefined();
      expect(loggerService.warn).toHaveBeenCalledWith(
        'EDF setup is not ready',
        expect.objectContaining({
          reason: 'DELEGATION_CONTRACT_ADDRESS is not configured',
        }),
      );
    });

    it('should report an invalid configured address without throwing', async () => {
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS =
        'not-an-address';

      await expect(
        securityService.logEdfReadiness(blockTag),
      ).resolves.toBeUndefined();
      expect(loggerService.warn).toHaveBeenCalledWith(
        'EDF setup is not ready',
        expect.objectContaining({
          reason: 'DELEGATION_CONTRACT_ADDRESS is not a valid address',
        }),
      );
    });

    it('should report a contract without code', async () => {
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS =
        delegationAddress;
      jest.spyOn(provider, 'getCode').mockResolvedValue('0x');

      await securityService.logEdfReadiness(blockTag);

      expect(loggerService.warn).toHaveBeenCalledWith(
        'EDF setup is not ready',
        expect.objectContaining({
          reason: 'No contract code at DELEGATION_CONTRACT_ADDRESS',
          delegationContractAddress: delegationAddress,
        }),
      );
    });

    it('should report an invalid active delegate', async () => {
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS =
        delegationAddress;
      jest.spyOn(provider, 'getCode').mockResolvedValue('0x1234');
      jest.spyOn(DelegationContractAbi__factory, 'connect').mockReturnValue({
        getDelegate: jest.fn().mockResolvedValue(hexZeroPad('0x0', 20)),
        supportsInterface: jest.fn().mockResolvedValue(true),
      } as any);

      await securityService.logEdfReadiness(blockTag);

      expect(loggerService.warn).toHaveBeenCalledWith(
        'EDF setup is not ready',
        expect.objectContaining({
          reason: 'DelegationContract has no valid active delegate',
        }),
      );
    });

    it('should report a delegate without a configured wallet', async () => {
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS =
        delegationAddress;
      jest.spyOn(provider, 'getCode').mockResolvedValue('0x1234');
      jest.spyOn(DelegationContractAbi__factory, 'connect').mockReturnValue({
        getDelegate: jest.fn().mockResolvedValue(delegationAddress),
        supportsInterface: jest.fn().mockResolvedValue(true),
      } as any);

      await securityService.logEdfReadiness(blockTag);

      expect(loggerService.warn).toHaveBeenCalledWith(
        'EDF setup is not ready',
        expect.objectContaining({
          reason: 'No configured wallet matches the active delegate',
          delegateAddress: delegationAddress,
        }),
      );
    });

    it('should report a contract without ERC-1271 support', async () => {
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS =
        delegationAddress;
      jest.spyOn(provider, 'getCode').mockResolvedValue('0x1234');
      jest.spyOn(DelegationContractAbi__factory, 'connect').mockReturnValue({
        getDelegate: jest.fn().mockResolvedValue(address2),
        supportsInterface: jest.fn().mockResolvedValue(false),
      } as any);

      await securityService.logEdfReadiness(blockTag);

      expect(loggerService.warn).toHaveBeenCalledWith(
        'EDF setup is not ready',
        expect.objectContaining({
          reason: 'DelegationContract does not support ERC-1271',
        }),
      );
    });

    it('should report a passed EDF preflight', async () => {
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS =
        delegationAddress;
      jest.spyOn(provider, 'getCode').mockResolvedValue('0x1234');
      jest.spyOn(DelegationContractAbi__factory, 'connect').mockReturnValue({
        getDelegate: jest.fn().mockResolvedValue(address2),
        supportsInterface: jest.fn().mockResolvedValue(true),
      } as any);

      await securityService.logEdfReadiness(blockTag);

      expect(loggerService.log).toHaveBeenCalledWith('EDF preflight passed', {
        delegationContractAddress: delegationAddress,
        delegateAddress: address2,
        configuredWalletAddresses: [address1, address2],
      });
    });

    it('should turn an RPC error into a warning', async () => {
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS =
        delegationAddress;
      jest.spyOn(provider, 'getCode').mockRejectedValue(new Error('RPC down'));

      await expect(
        securityService.logEdfReadiness(blockTag),
      ).resolves.toBeUndefined();
      expect(loggerService.warn).toHaveBeenCalledWith(
        'EDF setup is not ready',
        expect.objectContaining({
          reason: 'EDF preflight check failed: RPC down',
          errorName: 'Error',
          errorMessage: 'RPC down',
          errorStack: expect.stringContaining('Error: RPC down'),
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
        dsmVersion: 4,
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
        dsmVersion: 4,
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

  describe('getGuardianExecutionContext fail-closed (v5)', () => {
    const delegationAddress = hexZeroPad('0x5', 20);

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const mockV5 = ({
      configuredAddress = delegationAddress,
      code = '0x1234',
      supportsErc1271 = true,
      guardians = [delegationAddress],
    } = {}) => {
      jest.spyOn(securityService, 'version').mockResolvedValue(5);
      (securityService as any).config.DELEGATION_CONTRACT_ADDRESS =
        configuredAddress;
      jest.spyOn(provider, 'getCode').mockResolvedValue(code);
      jest.spyOn(DelegationContractAbi__factory, 'connect').mockReturnValue({
        getDelegate: jest.fn().mockResolvedValue(address1),
        isTerminated: jest.fn().mockResolvedValue(false),
        supportsInterface: jest.fn().mockResolvedValue(supportsErc1271),
      } as any);
      jest.spyOn(securityService, 'getGuardians').mockResolvedValue(guardians);
      jest
        .spyOn(walletService, 'selectDelegateWallet')
        .mockImplementation(() => undefined);
    };

    it('should throw if DELEGATION_CONTRACT_ADDRESS is not set', async () => {
      mockV5({ configuredAddress: '' });

      await expect(
        securityService.getGuardianExecutionContext(blockTag),
      ).rejects.toThrow('DELEGATION_CONTRACT_ADDRESS is required');
    });

    it('should throw if DELEGATION_CONTRACT_ADDRESS is not an address', async () => {
      mockV5({ configuredAddress: 'not-an-address' });

      await expect(
        securityService.getGuardianExecutionContext(blockTag),
      ).rejects.toThrow('DELEGATION_CONTRACT_ADDRESS is required');
    });

    it('should throw if there is no code at the delegation address', async () => {
      mockV5({ code: '0x' });

      await expect(
        securityService.getGuardianExecutionContext(blockTag),
      ).rejects.toThrow('No contract code at DELEGATION_CONTRACT_ADDRESS');
    });

    it('should throw if the delegation contract lacks ERC-1271 support', async () => {
      mockV5({ supportsErc1271: false });

      await expect(
        securityService.getGuardianExecutionContext(blockTag),
      ).rejects.toThrow('does not support ERC-1271');
    });

    it('should throw if the delegation contract is not a DSM guardian', async () => {
      mockV5({ guardians: [address1] });

      await expect(
        securityService.getGuardianExecutionContext(blockTag),
      ).rejects.toThrow('is not a DSM guardian');
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
        dsmVersion: 4,
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
