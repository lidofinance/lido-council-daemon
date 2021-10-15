import { hexZeroPad } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { verifyMessage, Wallet } from '@ethersproject/wallet';
import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { ProviderModule } from 'provider';
import { WALLET_PRIVATE_KEY } from './wallet.constants';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const wallet = Wallet.createRandom();
  let walletService: WalletService;

  class MockRpcProvider extends JsonRpcProvider {
    async _uncachedDetectNetwork() {
      return getNetwork(CHAINS.Goerli);
    }
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), LoggerModule, ProviderModule],
      providers: [
        WalletService,
        {
          provide: WALLET_PRIVATE_KEY,
          useValue: wallet.privateKey,
        },
      ],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    walletService = moduleRef.get(WalletService);
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
      const keysOpIndex = 1;
      const blockNumber = 1;
      const blockHash = hexZeroPad('0x3', 32);
      const signature = await walletService.signDepositData(
        prefix,
        depositRoot,
        keysOpIndex,
        blockNumber,
        blockHash,
      );

      expect(signature).toEqual(
        expect.objectContaining({
          _vs: expect.any(String),
          r: expect.any(String),
          s: expect.any(String),
          v: expect.any(Number),
        }),
      );

      const encoded = walletService.encodeDepositData(
        prefix,
        depositRoot,
        keysOpIndex,
        blockNumber,
        blockHash,
      );
      const message = keccak256(encoded);

      expect(verifyMessage(message, signature)).toBeTruthy();
    });
  });

  describe('encodeDepositData', () => {
    it('should encode deposit data', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const depositRoot = hexZeroPad('0x2', 32);
      const keysOpIndex = 1;
      const blockNumber = 1;
      const blockHash = hexZeroPad('0x3', 32);
      const result = walletService.encodeDepositData(
        prefix,
        depositRoot,
        keysOpIndex,
        blockNumber,
        blockHash,
      );

      expect(typeof result).toBe('string');
    });
  });

  describe('signPauseData', () => {
    it('should sign pause data', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const blockNumber = 1;
      const signature = await walletService.signPauseData(prefix, blockNumber);

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

  describe('encodePauseData', () => {
    it('should encode deposit data', async () => {
      const prefix = hexZeroPad('0x1', 32);
      const blockNumber = 1;
      const result = walletService.encodePauseData(prefix, blockNumber);

      expect(typeof result).toBe('string');
    });
  });
});
