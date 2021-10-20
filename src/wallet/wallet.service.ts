import { defaultAbiCoder } from '@ethersproject/abi';
import { Signature } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { formatEther } from '@ethersproject/units';
import { Wallet } from '@ethersproject/wallet';
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
  WALLET_BALANCE_UPDATE_BLOCK_RATE,
  WALLET_MIN_BALANCE,
  WALLET_PRIVATE_KEY,
} from './wallet.constants';

@Injectable()
export class WalletService implements OnModuleInit {
  constructor(
    @InjectMetric(METRIC_ACCOUNT_BALANCE) private accountBalance: Gauge<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @Inject(WALLET_PRIVATE_KEY) private privateKey: string,
    private providerService: ProviderService,
  ) {}

  async onModuleInit() {
    const guardianAddress = this.address;
    register.setDefaultLabels({ guardianAddress });

    await this.updateBalance();
    this.subscribeToEthereumUpdates();
  }

  public async subscribeToEthereumUpdates() {
    const provider = this.providerService.provider;

    provider.on('block', async (blockNumber) => {
      if (blockNumber % WALLET_BALANCE_UPDATE_BLOCK_RATE !== 0) return;
      this.updateBalance();
    });

    this.logger.log('WalletService subscribed to Ethereum events');
  }

  @OneAtTime()
  public async updateBalance() {
    const provider = this.providerService.provider;
    const balanceWei = await provider.getBalance(this.address);
    const formatted = `${formatEther(balanceWei)} ETH`;
    const isSufficient = balanceWei.gte(WALLET_MIN_BALANCE);

    this.accountBalance.set(Number(formatEther(balanceWei)));

    if (isSufficient) {
      this.logger.log('Account balance is sufficient', { balance: formatted });
    } else {
      this.logger.warn('Account balance is too low', { balance: formatted });
    }
  }

  private cachedWallet: Wallet | null = null;

  public get wallet(): Wallet {
    if (this.cachedWallet) return this.cachedWallet;

    if (!this.privateKey) {
      this.logger.warn(
        'Private key is not provided, a random address will be generated for the test run',
      );

      this.privateKey = Wallet.createRandom().privateKey;
    }

    this.cachedWallet = new Wallet(this.privateKey);
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
    const encodedData = defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'uint256', 'bytes32'],
      [prefix, depositRoot, keysOpIndex, blockNumber, blockHash],
    );

    const messageHash = keccak256(encodedData);
    return await this.signMessage(messageHash);
  }

  public async signPauseData(
    prefix: string,
    blockNumber: number,
  ): Promise<Signature> {
    const encodedData = defaultAbiCoder.encode(
      ['bytes32', 'uint256'],
      [prefix, blockNumber],
    );

    const messageHash = keccak256(encodedData);
    return this.signMessage(messageHash);
  }
}
