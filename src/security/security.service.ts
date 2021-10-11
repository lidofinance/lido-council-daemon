import { splitSignature } from '@ethersproject/bytes';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { SecurityAbi__factory } from 'generated/factories/SecurityAbi__factory';
import { SecurityAbi } from 'generated/SecurityAbi';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService } from 'provider';
import { WalletService } from 'wallet';
import { getDepositSecurityAddress } from './security.constants';

@Injectable()
export class SecurityService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private walletService: WalletService,
  ) {}

  private cachedContract: SecurityAbi | null = null;
  private cachedAttestMessagePrefix: string | null = null;
  private cachedPauseMessagePrefix: string | null = null;

  private async getContract(): Promise<SecurityAbi> {
    if (!this.cachedContract) {
      const address = await this.getDepositSecurityAddress();
      const provider = this.providerService.provider;
      this.cachedContract = SecurityAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  public async getDepositSecurityAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getDepositSecurityAddress(chainId);
  }

  public async getAttestMessagePrefix(): Promise<string> {
    if (!this.cachedAttestMessagePrefix) {
      const contract = await this.getContract();
      const messagePrefix = await contract.ATTEST_MESSAGE_PREFIX();
      this.cachedAttestMessagePrefix = messagePrefix;
    }

    return this.cachedAttestMessagePrefix;
  }

  public async getPauseMessagePrefix(): Promise<string> {
    if (!this.cachedPauseMessagePrefix) {
      const contract = await this.getContract();
      const messagePrefix = await contract.PAUSE_MESSAGE_PREFIX();
      this.cachedPauseMessagePrefix = messagePrefix;
    }

    return this.cachedPauseMessagePrefix;
  }

  public async getGuardians(): Promise<string[]> {
    const contract = await this.getContract();
    const guardians = await contract.getGuardians();

    return guardians;
  }

  public async getGuardianIndex(): Promise<number> {
    const guardians = await this.getGuardians();
    const address = this.walletService.address;

    return guardians.indexOf(address);
  }

  public async signDepositData(
    depositRoot: string,
    keysOpIndex: number,
  ): Promise<string> {
    const messagePrefix = await this.getAttestMessagePrefix();

    return await this.walletService.signDepositData(
      messagePrefix,
      depositRoot,
      keysOpIndex,
    );
  }

  public async getDepositData(
    depositRoot: string,
    keysOpIndex: number,
  ): Promise<{
    blockNumber: number;
    guardianIndex: number;
    signature: string;
  }> {
    const [blockNumber, guardianIndex, signature] = await Promise.all([
      this.providerService.getBlockNumber(),
      this.getGuardianIndex(),
      this.signDepositData(depositRoot, keysOpIndex),
    ]);

    return { blockNumber, guardianIndex, signature };
  }

  public async signPauseData(blockHeight: number): Promise<string> {
    const messagePrefix = await this.getPauseMessagePrefix();
    return await this.walletService.signPauseData(messagePrefix, blockHeight);
  }

  public async getPauseDepositData(): Promise<{
    blockNumber: number;
    guardianIndex: number;
    signature: string;
  }> {
    const [blockNumber, guardianIndex] = await Promise.all([
      this.providerService.getBlockNumber(),
      this.getGuardianIndex(),
    ]);
    const signature = await this.signPauseData(blockNumber);

    return { blockNumber, guardianIndex, signature };
  }

  public async pauseDeposits(blockHeight: number, signature: string) {
    const { r, _vs: vs } = splitSignature(signature);
    const wallet = this.walletService.wallet.connect(
      this.providerService.provider,
    );

    const contract = (await this.getContract()).connect(wallet);
    const isPaused = await contract.isPaused();

    if (isPaused) {
      this.logger.warn('Deposits are already paused');
      return;
    }

    return await contract.pauseDeposits(blockHeight, { r, vs });
  }
}
