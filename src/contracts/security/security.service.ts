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

  /**
   * Returns an instance of the contract
   */
  public async getContract(): Promise<SecurityAbi> {
    if (!this.cachedContract) {
      const address = await this.getDepositSecurityAddress();
      const provider = this.providerService.provider;
      this.cachedContract = SecurityAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  /**
   * Returns an instance of the contract that can send signed transactions
   */
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

  /**
   * Returns an address of the security contract
   */
  public async getDepositSecurityAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getDepositSecurityAddress(chainId);
  }

  /**
   * Returns an address of the deposit contract from the security contract
   */
  public async getDepositContractAddress() {
    const contract = await this.getContract();
    const address = await contract.DEPOSIT_CONTRACT();

    return address;
  }

  /**
   * Returns an address of the Lido contract from the security contract
   */
  public async getLidoContractAddress() {
    const contract = await this.getContract();
    const address = await contract.LIDO();

    return address;
  }

  /**
   * Returns a prefix from the contract with which the deposit message should be signed
   */
  public async getAttestMessagePrefix(): Promise<string> {
    if (!this.cachedAttestMessagePrefix) {
      const contract = await this.getContract();
      const messagePrefix = await contract.ATTEST_MESSAGE_PREFIX();
      this.cachedAttestMessagePrefix = messagePrefix;
    }

    return this.cachedAttestMessagePrefix;
  }

  /**
   * Returns a prefix from the contract with which the pause message should be signed
   */
  public async getPauseMessagePrefix(): Promise<string> {
    if (!this.cachedPauseMessagePrefix) {
      const contract = await this.getContract();
      const messagePrefix = await contract.PAUSE_MESSAGE_PREFIX();
      this.cachedPauseMessagePrefix = messagePrefix;
    }

    return this.cachedPauseMessagePrefix;
  }

  /**
   * Returns the maximum number of deposits per transaction from the contract
   */
  public async getMaxDeposits(): Promise<number> {
    const contract = await this.getContract();
    const maxDeposits = await contract.getMaxDeposits();

    return maxDeposits.toNumber();
  }

  /**
   * Returns the guardian list from the contract
   */
  public async getGuardians(): Promise<string[]> {
    const contract = await this.getContract();
    const guardians = await contract.getGuardians();

    return guardians;
  }

  /**
   * Returns the guardian index in the list
   */
  public async getGuardianIndex(): Promise<number> {
    const guardians = await this.getGuardians();
    const address = this.walletService.address;

    return guardians.indexOf(address);
  }

  /**
   * Returns guardian address
   */
  public getGuardianAddress(): string {
    return this.walletService.address;
  }

  /**
   * Signs a message to deposit buffered ethers with the prefix from the contract
   */
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

  /**
   * Signs a message to pause deposits with the prefix from the contract
   */
  public async signPauseData(blockNumber: number): Promise<Signature> {
    const messagePrefix = await this.getPauseMessagePrefix();

    return await this.walletService.signPauseData(messagePrefix, blockNumber);
  }

  /**
   * Returns the current state of deposits
   */
  public async isDepositsPaused(): Promise<boolean> {
    const contract = await this.getContractWithSigner();
    const isPaused = await contract.isPaused();
    return isPaused;
  }

  /**
   * Sends a transaction to pause deposits
   * @param blockNumber - the block number for which the message is signed
   * @param signature - message signature
   */
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
