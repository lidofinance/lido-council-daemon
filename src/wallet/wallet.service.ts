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

    try {
      await this.updateBalance();
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
      if (blockNumber % WALLET_BALANCE_UPDATE_BLOCK_RATE !== 0) return;
      this.updateBalance().catch((error) => this.logger.error(error));
    });

    this.logger.log('WalletService subscribed to Ethereum events');
  }

  /**
   * Updates the guardian account balance
   */
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

    this.cachedWallet = new Wallet(this.privateKey);
    return this.cachedWallet;
  }

  private cachedWallet: Wallet | null = null;

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
   * Signs a message to deposit buffered ethers
   * @param prefix - unique prefix from the contract for this type of message
   * @param depositRoot - current deposit root from the deposit contract
   * @param keysOpIndex - current index of keys operations from the registry contract
   * @param blockNumber - current block number
   * @param blockHash - current block hash
   * @returns signature
   */
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

  /**
   * Signs a message to pause deposits
   * @param prefix - unique prefix from the contract for this type of message
   * @param blockNumber - block number that is signed
   * @returns signature
   */
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
