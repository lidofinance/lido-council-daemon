import { Signature } from '@ethersproject/bytes';
import { ContractReceipt } from '@ethersproject/contracts';
import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { METRIC_PAUSE_ATTEMPTS } from 'common/prometheus';
import { OneAtTime } from 'common/decorators';
import { SecurityAbi__factory } from 'generated/factories/SecurityAbi__factory';
import { SecurityAbi } from 'generated/SecurityAbi';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Counter } from 'prom-client';
import { ProviderService } from 'provider';
import { WalletService } from 'wallet';
import { getDepositSecurityAddress } from './security.constants';

@Injectable()
export class SecurityService implements OnModuleInit {
  constructor(
    @InjectMetric(METRIC_PAUSE_ATTEMPTS) private pauseAttempts: Counter<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private walletService: WalletService,
  ) {}

  private cachedContract: SecurityAbi | null = null;
  private cachedContractWithSigner: SecurityAbi | null = null;
  private cachedAttestMessagePrefix: string | null = null;
  private cachedPauseMessagePrefix: string | null = null;

  public async onModuleInit(): Promise<void> {
    const guardianIndex = await this.getGuardianIndex();
    const address = this.walletService.address;

    if (guardianIndex === -1) {
      this.logger.warn(`Your address is not in the Guardian List`, { address });
    } else {
      this.logger.log(`You address is in the Guardian List`, { address });
    }
  }

  public async getContract(): Promise<SecurityAbi> {
    if (!this.cachedContract) {
      const address = await this.getDepositSecurityAddress();
      const provider = this.providerService.provider;
      this.cachedContract = SecurityAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  public async getContractWithSigner(): Promise<SecurityAbi> {
    if (!this.cachedContractWithSigner) {
      const wallet = this.walletService.wallet;
      const provider = this.providerService.provider;
      const walletWithProvider = wallet.connect(provider);
      const contract = await this.getContract();
      const contractWithSigner = contract.connect(walletWithProvider);

      this.cachedContractWithSigner = contractWithSigner;
    }

    return this.cachedContractWithSigner;
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

  public async getMaxDeposits(): Promise<number> {
    const contract = await this.getContract();
    const maxDeposits = await contract.getMaxDeposits();

    return maxDeposits.toNumber();
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

  public getGuardianAddress(): string {
    return this.walletService.address;
  }

  public async signDepositData(
    depositRoot: string,
    keysOpIndex: number,
    blockNumber: number,
    blockHash: string,
  ): Promise<Signature> {
    const messagePrefix = await this.getAttestMessagePrefix();

    return await this.walletService.signDepositData(
      messagePrefix,
      depositRoot,
      keysOpIndex,
      blockNumber,
      blockHash,
    );
  }

  public async signPauseData(blockNumber: number): Promise<Signature> {
    const messagePrefix = await this.getPauseMessagePrefix();

    return await this.walletService.signPauseData(messagePrefix, blockNumber);
  }

  public async isDepositsPaused(): Promise<boolean> {
    const contract = await this.getContractWithSigner();
    const isPaused = await contract.isPaused();
    return isPaused;
  }

  @OneAtTime()
  public async pauseDeposits(
    blockNumber: number,
    signature: Signature,
  ): Promise<ContractReceipt | void> {
    this.logger.warn('Try to pause deposits');
    this.pauseAttempts.inc();

    const contract = await this.getContractWithSigner();

    const { r, _vs: vs } = signature;
    const tx = await contract.pauseDeposits(blockNumber, { r, vs });

    this.logger.warn('Pause transaction sent', { txHash: tx.hash });
    this.logger.warn('Waiting for block confirmation');

    await tx.wait();

    this.logger.warn('Block confirmation received');
  }
}
