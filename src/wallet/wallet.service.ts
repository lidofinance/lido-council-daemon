import { defaultAbiCoder } from '@ethersproject/abi';
import { Signature } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { Wallet } from '@ethersproject/wallet';
import { Inject, Injectable } from '@nestjs/common';
import { WALLET_PRIVATE_KEY } from './wallet.constants';

@Injectable()
export class WalletService {
  constructor(@Inject(WALLET_PRIVATE_KEY) private privateKey: string) {}

  private cachedWallet: Wallet | null = null;

  public get wallet(): Wallet {
    if (!this.cachedWallet) {
      this.cachedWallet = new Wallet(this.privateKey);
    }

    return this.cachedWallet;
  }

  public get address(): string {
    return this.wallet.address;
  }

  public signMessage(message: string): Signature {
    return this.wallet._signingKey().signDigest(message);
  }

  public async signDepositData(
    prefix: string,
    depositRoot: string,
    keysOpIndex: number,
    blockNumber: number,
    blockHash: string,
  ): Promise<Signature> {
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
    return defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'uint256', 'bytes32'],
      [prefix, depositRoot, keysOpIndex, blockNumber, blockHash],
    );
  }

  public async signPauseData(
    prefix: string,
    blockNumber: number,
  ): Promise<Signature> {
    const encodedData = this.encodePauseData(prefix, blockNumber);
    const messageHash = keccak256(encodedData);

    return this.signMessage(messageHash);
  }

  public encodePauseData(prefix: string, blockNumber: number): string {
    return defaultAbiCoder.encode(
      ['bytes32', 'uint256'],
      [prefix, blockNumber],
    );
  }
}
