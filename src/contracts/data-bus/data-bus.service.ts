import { formatEther } from '@ethersproject/units';
import { Wallet } from '@ethersproject/wallet';
import { BigNumber } from '@ethersproject/bignumber';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { getToken, InjectMetric } from '@willsoto/nestjs-prometheus';
import { OneAtTime } from 'common/decorators';
import {
  METRIC_DATA_BUS_ACCOUNT_BALANCE,
  METRIC_DATA_BUS_RPC_REQUEST_DURATION,
  METRIC_DATA_BUS_RPC_REQUEST_ERRORS,
} from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Counter, Gauge, Histogram, register } from 'prom-client';
import { RpcProvider } from 'provider';
import {
  DATA_BUS_ADDRESS,
  DATA_BUS_BALANCE_UPDATE_BLOCK_RATE,
  DATA_BUS_PRIVATE_KEY,
  DATA_BUS_PROVIDER_CONFIG_PATH,
} from './data-bus.constants';

import { Configuration } from 'common/config';
import { DataBusClient } from './data-bus.client';
import { MessageRequiredFields } from 'messages';
import { DSMMessageSender } from './dsm-message-sender.client';
import { getProviderFactory } from 'provider/provider.factory';
import { StaticJsonRpcProvider } from '@ethersproject/providers';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class DataBusService {
  private dsmMessageSender!: DSMMessageSender;
  private provider!: RpcProvider;
  constructor(
    @InjectMetric(METRIC_DATA_BUS_ACCOUNT_BALANCE)
    private accountBalance: Gauge<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @Inject(DATA_BUS_PRIVATE_KEY) private privateKey: string,
    @Inject(DATA_BUS_ADDRESS) private dataBusAddress: string,
    protected readonly config: Configuration,
    @Inject(getToken(METRIC_DATA_BUS_RPC_REQUEST_DURATION))
    private rpcReqDurationMetric: Histogram<string>,
    @Inject(getToken(METRIC_DATA_BUS_RPC_REQUEST_ERRORS))
    private rpcReqErrorsMetric: Counter<string>,
    private moduleRef: ModuleRef,
  ) {}

  async initialize() {
    this.provider = await this.createProvider();

    const guardianAddress = this.address;
    register.setDefaultLabels({ guardianAddress });

    const dataBusClient = new DataBusClient(this.dataBusAddress, this.wallet);
    this.dsmMessageSender = new DSMMessageSender(dataBusClient);
    await this.monitorGuardianDataBusBalance();
    this.subscribeToEVMChainUpdates();
  }

  /**
   * Subscribes to the event of a new block appearance
   */
  public subscribeToEVMChainUpdates() {
    const provider = this.provider;
    provider.on('block', async (blockNumber) => {
      if (blockNumber % DATA_BUS_BALANCE_UPDATE_BLOCK_RATE !== 0) return;
      await this.monitorGuardianDataBusBalance().catch((error) =>
        this.logger.error(error),
      );
    });

    this.logger.log('DataBusService subscribed to network events');
  }

  /**
   * Monitors the guardian account balance to ensure it is sufficient for transactions.
   * Updates the account balance metric.
   */
  @OneAtTime()
  public async monitorGuardianDataBusBalance() {
    const balanceWei = await this.getAccountBalance();
    const balanceETH = formatEther(balanceWei);
    const { chainId } = await this.provider.getNetwork();
    this.accountBalance.set({ chainId }, Number(balanceETH));
    this.isBalanceSufficient(balanceWei, chainId);
  }

  /**
   * Retrieves the account balance in Wei.
   * @returns The account balance in Wei.
   */
  public async getAccountBalance(): Promise<BigNumber> {
    const provider = this.provider;
    return await provider.getBalance(this.address);
  }

  /**
   * Checks if the balance is sufficient to perform at least 10000 messages.
   * @param balanceWei The current balance in Wei.
   * @returns True if the balance is sufficient, otherwise false.
   */
  public isBalanceSufficient(balanceWei: BigNumber, chainId: number): boolean {
    const balance = formatEther(balanceWei);
    const isSufficient = balanceWei.gte(
      this.config.EVM_CHAIN_DATA_BUS_WALLET_MIN_BALANCE,
    );

    if (isSufficient) {
      this.logger.log('DataBusService account balance is sufficient', {
        balance,
        chainId,
      });
    } else {
      this.logger.warn('DataBusService account balance is too low', {
        balance,
        chainId,
      });
    }

    return isSufficient;
  }

  /**
   * Wallet class inherits Signer and can sign transactions and messages
   * using a private key as a standard Externally Owned Account (EOA)
   */
  private get wallet(): Wallet {
    if (this.cachedWallet) return this.cachedWallet;

    if (!this.privateKey) {
      this.logger.warn(
        'Private key is not provided, a random address will be generated for the test run',
      );

      this.privateKey = Wallet.createRandom().privateKey;
    }

    this.cachedWallet = new Wallet(this.privateKey, this.provider);
    return this.cachedWallet;
  }

  private cachedWallet: Wallet | null = null;

  public async createProvider(): Promise<RpcProvider> {
    const providerFactory = getProviderFactory(
      StaticJsonRpcProvider,
      DATA_BUS_PROVIDER_CONFIG_PATH,
    );

    return providerFactory(
      this.rpcReqDurationMetric,
      this.rpcReqErrorsMetric,
      this.moduleRef,
      this.config,
    );
  }

  /**
   * Guardian wallet address
   */
  private get address(): string {
    return this.wallet.address;
  }

  public publish(
    message: MessageRequiredFields & { app: { version: string } },
  ) {
    try {
      return this.dsmMessageSender.sendMessage(message);
    } catch (error: any) {
      this.logger.error(
        `An error occurred when sending a message using Data Bus`,
        { errorMessage: error.message, dataBusMessage: message },
      );
      throw error;
    }
  }
}
