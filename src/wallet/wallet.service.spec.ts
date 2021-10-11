import { keccak256 } from '@ethersproject/keccak256';
import { verifyMessage, Wallet } from '@ethersproject/wallet';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const wallet = Wallet.createRandom();

  let walletService: WalletService;
  let configService: ConfigService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [WalletService],
    }).compile();

    walletService = moduleRef.get(WalletService);
    configService = moduleRef.get(ConfigService);

    jest
      .spyOn(configService, 'get')
      .mockImplementation(() => wallet.privateKey);
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
      const prefix = '0x1234';
      const depositRoot = '0x5678';
      const keysOpIndex = 1;
      const signature = await walletService.signDepositData(
        prefix,
        depositRoot,
        keysOpIndex,
      );

      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(132);

      const encoded = walletService.encodeDepositData(
        prefix,
        depositRoot,
        keysOpIndex,
      );
      const message = keccak256(encoded);

      expect(verifyMessage(message, signature)).toBeTruthy();
    });
  });

  describe('encodeDepositData', () => {
    it('should encode deposit data', async () => {
      const prefix = '0x1234';
      const depositRoot = '0x5678';
      const keysOpIndex = 1;
      const keysOpIndexLength = 128;
      const result = walletService.encodeDepositData(
        prefix,
        depositRoot,
        keysOpIndex,
      );

      expect(typeof result).toBe('string');
      expect(result).toHaveLength(
        2 + (prefix.length - 2) + (depositRoot.length - 2) + keysOpIndexLength,
      );
    });
  });

  describe('signPauseData', () => {
    it('should sign pause data', async () => {
      const prefix = '0x1234';
      const keysOpIndex = 1;
      const signature = await walletService.signPauseData(prefix, keysOpIndex);

      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(132);
    });
  });

  describe('encodePauseData', () => {
    it('should encode deposit data', async () => {
      const prefix = '0x1234';
      const blockHeight = 1;
      const blockHeightLength = 128;
      const result = walletService.encodePauseData(prefix, blockHeight);

      expect(typeof result).toBe('string');
      expect(result).toHaveLength(2 + (prefix.length - 2) + blockHeightLength);
    });
  });
});
