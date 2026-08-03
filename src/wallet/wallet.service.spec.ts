import { hexZeroPad } from '@ethersproject/bytes';
import { Wallet } from '@ethersproject/wallet';
import { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MockProviderModule } from 'provider';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { WalletModule } from 'wallet';
import { DELEGATE_PRIVATE_KEYS, WALLET_PRIVATE_KEY } from './wallet.constants';
import { WalletService } from './wallet.service';
import {
  keccak256,
  parseEther,
  recoverAddress,
  solidityKeccak256,
  solidityPack,
} from 'ethers/lib/utils';

const TEST_MODULE_ID = 1;

describe('WalletService', () => {
  const wallet = Wallet.createRandom();
  const firstDelegateWallet = Wallet.createRandom();
  const secondDelegateWallet = Wallet.createRandom();
  let walletService: WalletService;
  let provider: SimpleFallbackJsonRpcBatchProvider;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        WalletModule,
      ],
    })
      .overrideProvider(WALLET_PRIVATE_KEY)
      .useValue(wallet.privateKey)
      .overrideProvider(DELEGATE_PRIVATE_KEYS)
      .useValue([
        firstDelegateWallet.privateKey,
        secondDelegateWallet.privateKey,
      ])
      .compile();

    walletService = moduleRef.get(WalletService);
    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
  });

  describe('subscribeToEthereumUpdates', () => {
    it('should subscribe to updates', () => {
      const mockOn = jest
        .spyOn(provider, 'on')
        .mockImplementation(() => undefined as any);

      walletService.subscribeToEthereumUpdates();
      expect(mockOn).toHaveBeenCalledTimes(1);
      expect(mockOn).toBeCalledWith('block', expect.any(Function));
    });
  });

  describe('monitorGuardianBalance', () => {
    it('records balance and nonce metrics for the selected delegate', async () => {
      walletService.selectDelegateWallet(secondDelegateWallet.address);
      jest.spyOn(provider, 'getBalance').mockResolvedValue(parseEther('1'));
      jest
        .spyOn(provider, 'getTransactionCount')
        .mockImplementation(async (_address, blockTag) =>
          blockTag === 'latest' ? 3 : 5,
        );
      const accountBalanceSet = jest.spyOn(
        (walletService as any).accountBalance,
        'set',
      );
      const nonceLatestLabels = jest
        .spyOn((walletService as any).nonceLatest, 'labels')
        .mockReturnValue({ set: jest.fn() });
      const noncePendingLabels = jest
        .spyOn((walletService as any).noncePending, 'labels')
        .mockReturnValue({ set: jest.fn() });
      const nonceGapLabels = jest
        .spyOn((walletService as any).nonceGap, 'labels')
        .mockReturnValue({ set: jest.fn() });

      await walletService.monitorGuardianBalance();

      expect(provider.getBalance).toHaveBeenCalledWith(
        secondDelegateWallet.address,
      );
      expect(provider.getTransactionCount).toHaveBeenCalledWith(
        secondDelegateWallet.address,
        'latest',
      );
      expect(provider.getTransactionCount).toHaveBeenCalledWith(
        secondDelegateWallet.address,
        'pending',
      );
      expect(accountBalanceSet).toHaveBeenCalledWith(
        { delegateAddress: secondDelegateWallet.address },
        1,
      );
      const labels = {
        network: 'ethereum',
        delegateAddress: secondDelegateWallet.address,
      };
      expect(nonceLatestLabels).toHaveBeenCalledWith(labels);
      expect(noncePendingLabels).toHaveBeenCalledWith(labels);
      expect(nonceGapLabels).toHaveBeenCalledWith(labels);
    });
  });

  describe('wallet', () => {
    it('should return a wallet', async () => {
      expect(walletService.wallet).toBeInstanceOf(Wallet);
    });

    it('should cache instance', async () => {
      expect(walletService.wallet).toBe(walletService.wallet);
    });

    it('should select a configured delegate wallet', () => {
      walletService.selectDelegateWallet(secondDelegateWallet.address);
      const messageHash = hexZeroPad('0x1', 32);

      expect(walletService.wallet.address).toBe(secondDelegateWallet.address);
      expect(
        recoverAddress(messageHash, walletService.signMessage(messageHash)),
      ).toBe(secondDelegateWallet.address);
    });

    it('should switch back to the legacy wallet', () => {
      walletService.selectDelegateWallet(firstDelegateWallet.address);
      walletService.selectLegacyWallet();

      expect(walletService.wallet.address).toBe(wallet.address);
    });

    it('should reject an active delegate without a configured key', () => {
      const unknownDelegate = Wallet.createRandom();

      expect(() =>
        walletService.selectDelegateWallet(unknownDelegate.address),
      ).toThrow(
        `No configured delegate private key matches active delegate ${unknownDelegate.address}`,
      );
    });
  });

  describe('address', () => {
    it('should return correct address', async () => {
      expect(walletService.address).toBe(wallet.address);
    });
  });

  describe('signDepositData', () => {
    it('should sign deposit data', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const depositRoot = hexZeroPad('0x2', 32);
      const nonce = 1;
      const blockNumber = 1;
      const blockHash = hexZeroPad('0x3', 32);
      const signature = await walletService.signDepositData({
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

    it('should sign deposit data for DSM v4 without contract version', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const depositRoot = hexZeroPad('0x2', 32);
      const nonce = 1;
      const blockNumber = 1;
      const blockHash = hexZeroPad('0x3', 32);
      const signature = await walletService.signDepositData({
        prefix,
        depositRoot,
        nonce,
        blockNumber,
        blockHash,
        stakingModuleId: TEST_MODULE_ID,
      });

      const messageHash = solidityKeccak256(
        ['bytes32', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256'],
        [prefix, blockNumber, blockHash, depositRoot, TEST_MODULE_ID, nonce],
      );

      expect(recoverAddress(messageHash, signature)).toBe(
        walletService.address,
      );
    });

    it('should sign the guardian-bound DSM v5 deposit digest', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const depositRoot = hexZeroPad('0x2', 32);
      const blockHash = hexZeroPad('0x3', 32);
      const guardianAddress = Wallet.createRandom().address;
      const signature = await walletService.signDepositData({
        prefix,
        depositRoot,
        nonce: 2,
        blockNumber: 10,
        blockHash,
        stakingModuleId: TEST_MODULE_ID,
        dsmVersion: 5,
        guardianAddress,
      });
      const messageHash = solidityKeccak256(
        [
          'bytes32',
          'address',
          'uint256',
          'bytes32',
          'bytes32',
          'uint256',
          'uint256',
        ],
        [
          prefix,
          guardianAddress,
          10,
          blockHash,
          depositRoot,
          TEST_MODULE_ID,
          2,
        ],
      );

      expect(recoverAddress(messageHash, signature)).toBe(
        walletService.address,
      );
    });
  });

  describe('signPauseData', () => {
    it('should sign pause data for DSM v4 without contract version', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const blockNumber = 1;
      const signature = await walletService.signPauseData({
        prefix,
        blockNumber,
      });

      const messageHash = solidityKeccak256(
        ['bytes32', 'uint256'],
        [prefix, blockNumber],
      );

      expect(recoverAddress(messageHash, signature)).toBe(
        walletService.address,
      );
    });

    it('should sign the guardian-bound DSM v5 pause digest', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const guardianAddress = Wallet.createRandom().address;
      const signature = await walletService.signPauseData({
        prefix,
        blockNumber: 10,
        dsmVersion: 5,
        guardianAddress,
      });
      const messageHash = solidityKeccak256(
        ['bytes32', 'address', 'uint256'],
        [prefix, guardianAddress, 10],
      );

      expect(recoverAddress(messageHash, signature)).toBe(
        walletService.address,
      );
    });
  });

  describe('signUnvetData', () => {
    it('should return valid signature', async () => {
      const UNVET_MESSAGE_PREFIX = createUnvetMessagePrefix(
        '0xB8ae82F7BFF2553bAF158B7a911DC10162045C53',
      );

      // use method underhood that do non-standart data packing
      const signature = await walletService.signUnvetData({
        prefix: UNVET_MESSAGE_PREFIX,
        blockNumber: 1429451,
        blockHash:
          '0x528b085cf0951e7c3003deb40db355cd35c77018f4cdc937bd10783e1c15588c',
        nonce: 11,
        stakingModuleId: 1,
        operatorIds: '0x0000000000000000',
        vettedKeysByOperator: '0x00000000000000000000000000000032',
      });

      const encodedData = solidityKeccak256(
        [
          'bytes32',
          'uint256',
          'bytes32',
          'uint256',
          'uint256',
          'bytes',
          'bytes',
        ],
        [
          UNVET_MESSAGE_PREFIX,
          1429451,
          '0x528b085cf0951e7c3003deb40db355cd35c77018f4cdc937bd10783e1c15588c',
          1,
          11,
          '0x0000000000000000',
          '0x00000000000000000000000000000032',
        ],
      );

      const signer = recoverAddress(encodedData, signature);

      expect(signer).toEqual(walletService.address);
    });

    it('should sign unvet data for DSM v4 without contract version', async () => {
      const UNVET_MESSAGE_PREFIX = createUnvetMessagePrefix(
        '0xB8ae82F7BFF2553bAF158B7a911DC10162045C53',
      );
      const blockNumber = 1429451;
      const blockHash =
        '0x528b085cf0951e7c3003deb40db355cd35c77018f4cdc937bd10783e1c15588c';
      const nonce = 11;
      const operatorIds = '0x0000000000000000';
      const vettedKeysByOperator = '0x00000000000000000000000000000032';

      const signature = await walletService.signUnvetData({
        prefix: UNVET_MESSAGE_PREFIX,
        blockNumber,
        blockHash,
        nonce,
        stakingModuleId: 1,
        operatorIds,
        vettedKeysByOperator,
      });

      const messageHash = solidityKeccak256(
        [
          'bytes32',
          'uint256',
          'bytes32',
          'uint256',
          'uint256',
          'bytes',
          'bytes',
        ],
        [
          UNVET_MESSAGE_PREFIX,
          blockNumber,
          blockHash,
          1,
          nonce,
          operatorIds,
          vettedKeysByOperator,
        ],
      );

      expect(recoverAddress(messageHash, signature)).toBe(
        walletService.address,
      );
    });

    it('should sign the guardian-bound DSM v5 unvet digest', async () => {
      const prefix = createUnvetMessagePrefix(
        '0xB8ae82F7BFF2553bAF158B7a911DC10162045C53',
      );
      const blockHash =
        '0x528b085cf0951e7c3003deb40db355cd35c77018f4cdc937bd10783e1c15588c';
      const guardianAddress = Wallet.createRandom().address;
      const operatorIds = '0x0000000000000000';
      const vettedKeysByOperator = '0x00000000000000000000000000000032';
      const signature = await walletService.signUnvetData({
        prefix,
        blockNumber: 1429451,
        blockHash,
        nonce: 11,
        stakingModuleId: 1,
        operatorIds,
        vettedKeysByOperator,
        dsmVersion: 5,
        guardianAddress,
      });
      const messageHash = solidityKeccak256(
        [
          'bytes32',
          'address',
          'uint256',
          'bytes32',
          'uint256',
          'uint256',
          'bytes',
          'bytes',
        ],
        [
          prefix,
          guardianAddress,
          1429451,
          blockHash,
          1,
          11,
          operatorIds,
          vettedKeysByOperator,
        ],
      );

      expect(recoverAddress(messageHash, signature)).toBe(
        walletService.address,
      );
    });

    it('should reject DSM v5 signing without a guardian address', async () => {
      await expect(
        walletService.signUnvetData({
          prefix: hexZeroPad('0x1', 32),
          blockNumber: 1,
          blockHash: hexZeroPad('0x2', 32),
          nonce: 1,
          stakingModuleId: 1,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000001',
          dsmVersion: 5,
        }),
      ).rejects.toThrow(
        'A valid guardian address is required for DSM version 5',
      );
    });
  });

  function createUnvetMessagePrefix(contractAddress: string) {
    const HOLESKY_CHAIN_ID = 17000;

    // Precomputed hash value as bytes32
    const precomputedHash =
      '0x2dd9727393562ed11c29080a884630e2d3a7078e71b313e713a8a1ef68948f6a';

    // Packing data similarly to Solidity's `abi.encodePacked`
    const data = solidityPack(
      ['bytes32', 'uint256', 'address'],
      [precomputedHash, HOLESKY_CHAIN_ID, contractAddress],
    );

    // Hashing the packed data
    const UNVET_MESSAGE_PREFIX = keccak256(data);

    return UNVET_MESSAGE_PREFIX;
  }
});
