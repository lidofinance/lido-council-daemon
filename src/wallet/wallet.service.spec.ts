import { keccak256 } from '@ethersproject/keccak256';
import { verifyMessage, Wallet } from '@ethersproject/wallet';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { WALLET_PRIVATE_KEY } from './wallet.constants';
import { WalletService } from './wallet.service';

const unit256Length = 128;
const hashLength = (str) => str.length - 2;

describe('WalletService', () => {
  const wallet = Wallet.createRandom();
  let walletService: WalletService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        WalletService,
        {
          provide: WALLET_PRIVATE_KEY,
          useValue: wallet.privateKey,
        },
      ],
    }).compile();

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
      const prefix = '0x1234';
      const depositRoot = '0x5678';
      const keysOpIndex = 1;
      const blockNumber = 1;
      const blockHash = '0x4321';
      const signature = await walletService.signDepositData(
        prefix,
        depositRoot,
        keysOpIndex,
        blockNumber,
        blockHash,
      );

      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(132);

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
      const prefix = '0x1234';
      const depositRoot = '0x5678';
      const keysOpIndex = 1;
      const blockNumber = 1;
      const blockHash = '0x5678';
      const result = walletService.encodeDepositData(
        prefix,
        depositRoot,
        keysOpIndex,
        blockNumber,
        blockHash,
      );

      expect(typeof result).toBe('string');
      expect(result).toHaveLength(
        2 +
          hashLength(prefix) +
          hashLength(depositRoot) +
          unit256Length +
          unit256Length +
          hashLength(blockHash),
      );
    });
  });

  describe('signPauseData', () => {
    it('should sign pause data', async () => {
      const prefix = '0x1234';
      const blockNumber = 1;
      const signature = await walletService.signPauseData(prefix, blockNumber);

      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(132);
    });
  });

  describe('encodePauseData', () => {
    it('should encode deposit data', async () => {
      const prefix = '0x1234';
      const blockNumber = 1;
      const result = walletService.encodePauseData(prefix, blockNumber);

      expect(typeof result).toBe('string');
      expect(result).toHaveLength(2 + hashLength(prefix) + unit256Length);
    });
  });
});
