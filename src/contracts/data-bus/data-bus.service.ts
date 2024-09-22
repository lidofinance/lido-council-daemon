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
import { METRIC_ACCOUNT_BALANCE } from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Gauge, register } from 'prom-client';
import { ProviderService } from 'provider';
import {
  DATA_BUS_ADDRESS,
  DATA_BUS_BALANCE_UPDATE_BLOCK_RATE,
  DATA_BUS_PRIVATE_KEY,
} from './data-bus.constants';

import { Configuration } from 'common/config';
import { DataBusClient } from './data-bus.client';
import { MessageRequiredFields } from 'messages';
import { DSMMessageSender } from './dsm-message.sender.client';

@Injectable()
export class DataBusService implements OnModuleInit {
  private dsmMessageSender!: DSMMessageSender;
  constructor(
    @InjectMetric(METRIC_ACCOUNT_BALANCE) private accountBalance: Gauge<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @Inject(DATA_BUS_PRIVATE_KEY) private privateKey: string,
    @Inject(DATA_BUS_ADDRESS) private dataBusAddress: string,
    private providerService: ProviderService,
    protected readonly config: Configuration,
  ) {}

  async onModuleInit() {
    const guardianAddress = this.address;
    register.setDefaultLabels({ guardianAddress });

    try {
      const dataBusClient = new DataBusClient(this.dataBusAddress, this.wallet);
      this.dsmMessageSender = new DSMMessageSender(dataBusClient);
      await this.monitorGuardianBalance();
      this.subscribeToEthereumUpdates();
    } catch (error) {
      this.logger.error(error);
    }
  }

  /**
   * Subscribes to the event of a new block appearance
   */
  public subscribeToEthereumUpdates() {
    const provider = this.providerService.provider;
    provider.on('block', async (blockNumber) => {
      if (blockNumber % DATA_BUS_BALANCE_UPDATE_BLOCK_RATE !== 0) return;
      await this.monitorGuardianBalance().catch((error) =>
        this.logger.error(error),
      );
    });

    this.logger.log('WalletService subscribed to Ethereum events');
  }

  /**
   * Monitors the guardian account balance to ensure it is sufficient for transactions.
   * Updates the account balance metric.
   */
  @OneAtTime()
  public async monitorGuardianBalance() {
    const balanceWei = await this.getAccountBalance();
    const balanceETH = formatEther(balanceWei);
    this.accountBalance.set(Number(balanceETH));
    this.isBalanceSufficient(balanceWei);
  }

  /**
   * Retrieves the account balance in Wei.
   * @returns The account balance in Wei.
   */
  public async getAccountBalance(): Promise<BigNumber> {
    const provider = this.providerService.provider;
    return await provider.getBalance(this.address);
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
    // TODO: check critical balance in data bus use case
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
    if (this.cachedWallet) return this.cachedWallet;

    if (!this.privateKey) {
      this.logger.warn(
        'Private key is not provided, a random address will be generated for the test run',
      );

      this.privateKey = Wallet.createRandom().privateKey;
    }

    this.cachedWallet = new Wallet(
      this.privateKey,
      this.providerService.provider,
    );
    return this.cachedWallet;
  }

  private cachedWallet: Wallet | null = null;

  /**
   * Guardian wallet address
   */
  public get address(): string {
    return this.wallet.address;
  }

  public publish(
    message: MessageRequiredFields & { app: { version: string } },
  ) {
    return this.dsmMessageSender.sendMessage(message);
  }
}
