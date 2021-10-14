import { BigNumber } from '@ethersproject/bignumber';
import { keccak256 } from '@ethersproject/keccak256';
import { Wallet } from '@ethersproject/wallet';
import { Injectable } from '@nestjs/common';
import { Configuration } from 'common/config';
import { joinHex, hexPadUnit256 } from 'utils';

@Injectable()
export class WalletService {
  constructor(private config: Configuration) {}

  private cachedWallet: Wallet | null = null;

  public get wallet(): Wallet {
    if (!this.cachedWallet) {
      const privateKey = this.config.WALLET_PRIVATE_KEY;
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
    blockNumber: number,
    blockHash: string,
  ): Promise<string> {
    const encodedData = this.encodeDepositData(
      prefix,
      depositRoot,
      keysOpIndex,
      blockNumber,
      blockHash,
    );
    const messageHash = keccak256(encodedData);

    return await this.signMessage(messageHash);
  }

  public encodeDepositData(
    prefix: string,
    depositRoot: string,
    keysOpIndex: number,
    blockNumber: number,
    blockHash: string,
  ): string {
    const keyOpIndexHex = BigNumber.from(keysOpIndex).toHexString();
    const keyOpIndex256 = hexPadUnit256(keyOpIndexHex);

    const blockNumberHex = BigNumber.from(blockNumber).toHexString();
    const blockNumber256 = hexPadUnit256(blockNumberHex);

    return joinHex(
      prefix,
      depositRoot,
      keyOpIndex256,
      blockNumber256,
      blockHash,
    );
  }

  public async signPauseData(
    prefix: string,
    blockNumber: number,
  ): Promise<string> {
    const encodedData = this.encodePauseData(prefix, blockNumber);
    const messageHash = keccak256(encodedData);

    return this.signMessage(messageHash);
  }

  public encodePauseData(prefix: string, blockNumber: number): string {
    const blockNumberHex = BigNumber.from(blockNumber).toHexString();
    const blockNumber256 = hexPadUnit256(blockNumberHex);

    return joinHex(prefix, blockNumber256);
  }
}
