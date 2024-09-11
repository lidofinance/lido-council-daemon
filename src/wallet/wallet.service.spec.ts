import { hexZeroPad } from '@ethersproject/bytes';
import { Wallet } from '@ethersproject/wallet';
import { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MockProviderModule } from 'provider';
import { ProviderService } from 'provider';
import { WalletModule } from 'wallet';
import { WALLET_PRIVATE_KEY } from './wallet.constants';
import { WalletService } from './wallet.service';
import {
  keccak256,
  recoverAddress,
  solidityKeccak256,
  solidityPack,
} from 'ethers/lib/utils';

const TEST_MODULE_ID = 1;

describe('WalletService', () => {
  const wallet = Wallet.createRandom();
  let walletService: WalletService;
  let providerService: ProviderService;
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
      .compile();

    walletService = moduleRef.get(WalletService);
    providerService = moduleRef.get(ProviderService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
  });

  describe('subscribeToEthereumUpdates', () => {
    it('should subscribe to updates', () => {
      const mockOn = jest
        .spyOn(providerService.provider, 'on')
        .mockImplementation(() => undefined as any);

      walletService.subscribeToEthereumUpdates();
      expect(mockOn).toBeCalledTimes(1);
      expect(mockOn).toBeCalledWith('block', expect.any(Function));
    });
  });

  describe('wallet', () => {
    it('should return a wallet', async () => {
      expect(walletService.wallet).toBeInstanceOf(Wallet);
    });

    it('should cache instance', async () => {
      expect(walletService.wallet).toBe(walletService.wallet);
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
  });

  describe('signPauseDataV2', () => {
    it('should sign pause data', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const blockNumber = 1;
      const signature = await walletService.signPauseDataV2({
        prefix,
        blockNumber,
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
