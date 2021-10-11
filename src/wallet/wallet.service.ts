import { BigNumber } from '@ethersproject/bignumber';
import { keccak256 } from '@ethersproject/keccak256';
import { Wallet } from '@ethersproject/wallet';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { joinHex, hexPadUnit64 } from 'utils';

@Injectable()
export class WalletService {
  constructor(private configService: ConfigService) {}

  private cachedWallet: Wallet | null = null;

  public get wallet(): Wallet {
    if (!this.cachedWallet) {
      const privateKey = this.configService.get<string>('WALLET_PRIVATE_KEY');
      this.cachedWallet = new Wallet(privateKey);
    }

    return this.cachedWallet;
  }

  public get address(): string {
    return this.wallet.address;
  }

  public async signMessage(message: string): Promise<string> {
    return await this.wallet.signMessage(message);
  }

  public async signDepositData(
    prefix: string,
    depositRoot: string,
    keysOpIndex: number,
  ): Promise<string> {
    const encoded = this.encodeDepositData(prefix, depositRoot, keysOpIndex);
    const hash = keccak256(encoded);

    return this.signMessage(hash);
  }

  public encodeDepositData(
    prefix: string,
    depositRoot: string,
    keysOpIndex: number,
  ): string {
    const keyOpIndexHex = BigNumber.from(keysOpIndex).toHexString();
    const keyOpIndex256 = hexPadUnit64(keyOpIndexHex);

    return joinHex(prefix, depositRoot, keyOpIndex256);
  }

  public async signPauseData(
    prefix: string,
    blockHeight: number,
  ): Promise<string> {
    const encoded = this.encodePauseData(prefix, blockHeight);
    const hash = keccak256(encoded);

    return this.signMessage(hash);
  }

  public encodePauseData(prefix: string, blockHeight: number): string {
    const blockHeightHex = BigNumber.from(blockHeight).toHexString();
    const blockHeight256 = hexPadUnit64(blockHeightHex);

    return joinHex(prefix, blockHeight256);
  }
}
