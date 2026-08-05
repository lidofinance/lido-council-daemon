import { Signature } from '@ethersproject/bytes';
import { formatEther } from '@ethersproject/units';
import { Wallet } from '@ethersproject/wallet';
import { BigNumber } from '@ethersproject/bignumber';
import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { OneAtTime } from 'common/decorators';
import {
  METRIC_ACCOUNT_BALANCE,
  METRIC_NONCE_LATEST,
  METRIC_NONCE_PENDING,
  METRIC_NONCE_GAP,
} from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Gauge } from 'prom-client';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import {
  WALLET_BALANCE_UPDATE_BLOCK_RATE,
  WALLET_PRIVATE_KEYS,
} from './wallet.constants';
import {
  SignDepositDataParams,
  SignPauseDataParams,
  SignUnvetDataParams,
} from './wallet.interfaces';
import { Configuration } from 'common/config';
import { utils } from 'ethers';
import { getDsmStrategy } from 'contracts/security/dsm-version.strategy';

@Injectable()
export class WalletService implements OnModuleInit {
  constructor(
    @InjectMetric(METRIC_ACCOUNT_BALANCE) private accountBalance: Gauge<string>,
    @InjectMetric(METRIC_NONCE_LATEST) private nonceLatest: Gauge<string>,
    @InjectMetric(METRIC_NONCE_PENDING) private noncePending: Gauge<string>,
    @InjectMetric(METRIC_NONCE_GAP) private nonceGap: Gauge<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @Inject(WALLET_PRIVATE_KEYS) private privateKeys: string[],
    private provider: SimpleFallbackJsonRpcBatchProvider,
    protected readonly config: Configuration,
  ) {}

  onModuleInit() {
    this.subscribeToEthereumUpdates();
  }

  /**
   * Subscribes to the event of a new block appearance
   */
  public subscribeToEthereumUpdates() {
    this.provider.on('block', async (blockNumber) => {
      if (blockNumber % WALLET_BALANCE_UPDATE_BLOCK_RATE !== 0) return;
      await this.monitorGuardianBalance().catch((error) =>
        this.logger.error(error),
      );
    });

    this.logger.log('WalletService subscribed to Ethereum events');
  }

  /**
   * Monitors the guardian account balance and nonce to ensure it is sufficient for transactions.
   * Updates the account balance and nonce metrics.
   */
  @OneAtTime()
  public async monitorGuardianBalance() {
    const delegateAddress = this.address;
    const [balanceWei, latestNonce, pendingNonce] = await Promise.all([
      this.getAccountBalance(delegateAddress),
      this.provider.getTransactionCount(delegateAddress, 'latest'),
      this.provider.getTransactionCount(delegateAddress, 'pending'),
    ]);

    const balanceETH = formatEther(balanceWei);
    this.accountBalance.set({ delegateAddress }, Number(balanceETH));
    this.isBalanceSufficient(balanceWei);

    const gap = pendingNonce - latestNonce;
    const labels = { network: 'ethereum', delegateAddress };
    this.nonceLatest.labels(labels).set(latestNonce);
    this.noncePending.labels(labels).set(pendingNonce);
    this.nonceGap.labels(labels).set(gap);
  }

  /**
   * Retrieves the account balance in Wei.
   * @returns The account balance in Wei.
   */
  public async getAccountBalance(
    walletAddress = this.address,
  ): Promise<BigNumber> {
    return await this.provider.getBalance(walletAddress);
  }

  /**
   * Checks if the balance is at or below the critical threshold,
   * indicating that the balance is critical and may require intervention.
   *
   * @returns True if the balance is at or below the critical value, otherwise false.
   */
  public async isBalanceCritical(): Promise<boolean> {
    const balanceWei = await this.getAccountBalance();
    const balanceETH = formatEther(balanceWei);
    const formatted = `${balanceETH} ETH`;
    const isCritical = balanceWei.lte(this.config.WALLET_CRITICAL_BALANCE);

    if (isCritical) {
      this.logger.log('Account balance is critical', { balance: formatted });
    }

    return isCritical;
  }

  /**
   * Checks if the balance is sufficient to perform at least 10 unvetting operations.
   * @param balanceWei The current balance in Wei.
   * @returns True if the balance is sufficient, otherwise false.
   */
  public isBalanceSufficient(balanceWei): boolean {
    const balanceETH = formatEther(balanceWei);
    const formatted = `${balanceETH} ETH`;
    const isSufficient = balanceWei.gte(this.config.WALLET_MIN_BALANCE);

    if (isSufficient) {
      this.logger.log('Account balance is sufficient', { balance: formatted });
    } else {
      this.logger.warn('Account balance is too low', { balance: formatted });
    }

    return isSufficient;
  }

  /**
   * Wallet class inherits Signer and can sign transactions and messages
   * using a private key as a standard Externally Owned Account (EOA)
   */
  public get wallet(): Wallet {
    if (this.activeWallet) return this.activeWallet;
    return this.wallets[0];
  }

  private activeWallet: Wallet | null = null;
  private cachedWallets: Wallet[] | null = null;

  public selectLegacyWallet(): void {
    this.activeWallet = this.wallets[0];
  }

  public selectDelegateWallet(delegateAddress: string): void {
    const normalizedAddress = utils.getAddress(delegateAddress);
    const wallet = this.wallets.find(
      (candidate) => candidate.address === normalizedAddress,
    );

    if (!wallet) {
      throw new Error(
        `No configured wallet private key matches active delegate ${normalizedAddress}`,
      );
    }

    this.activeWallet = wallet;
  }

  private get wallets(): Wallet[] {
    if (this.cachedWallets) return this.cachedWallets;

    const privateKeys = (this.privateKeys ?? []).filter(Boolean);
    if (privateKeys.length === 0) {
      this.logger.warn(
        'Private key is not provided, a random address will be generated for the test run',
      );
      privateKeys.push(Wallet.createRandom().privateKey);
    }

    this.cachedWallets = privateKeys.map((privateKey) => new Wallet(privateKey));
    return this.cachedWallets;
  }

  /**
   * Guardian wallet address
   */
  public get address(): string {
    return this.wallet.address;
  }

  /**
   * Signs a message using a private key
   * @param message - message that is signed
   * @returns signature
   */
  public signMessage(message: string): Signature {
    return this.wallet._signingKey().signDigest(message);
  }

  /**
   * Signs a message to deposit buffered ethers. The digest layout is owned by
   * the DSM version strategy.
   * @param params - parameters for signing deposit message
   * @returns signature
   */
  public async signDepositData(
    params: SignDepositDataParams,
  ): Promise<Signature> {
    return this.signMessage(
      getDsmStrategy(params.dsmVersion).depositDigest(params),
    );
  }

  /**
   * Signs a message to pause deposits. The digest layout is owned by the DSM
   * version strategy.
   * @param params - parameters for signing pause message
   * @returns signature
   */
  public async signPauseData(params: SignPauseDataParams): Promise<Signature> {
    return this.signMessage(
      getDsmStrategy(params.dsmVersion).pauseDigest(params),
    );
  }

  /**
   * Sign a message to unvet signing keys. The digest layout is owned by the DSM
   * version strategy.
   * @param params - parameters for signing unvet message
   * @returns signature
   */
  public async signUnvetData(params: SignUnvetDataParams): Promise<Signature> {
    this.logger.debug?.('Sign data:', { ...params });

    const messageHash = getDsmStrategy(params.dsmVersion).unvetDigest(params);

    this.logger.debug?.('Message hash:', {
      messageHash,
      blockHash: params.blockHash,
      blockNumber: params.blockNumber,
    });

    return this.signMessage(messageHash);
  }
}
