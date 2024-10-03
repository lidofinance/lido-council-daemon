import { defaultAbiCoder } from '@ethersproject/abi';
import { Signature } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
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
  WALLET_BALANCE_UPDATE_BLOCK_RATE,
  WALLET_PRIVATE_KEY,
} from './wallet.constants';
import {
  SignDepositDataParams,
  SignModulePauseDataParams,
  SignPauseDataParams,
  SignUnvetDataParams,
} from './wallet.interfaces';
import { utils } from 'ethers';
import { Configuration } from 'common/config';

@Injectable()
export class WalletService implements OnModuleInit {
  constructor(
    @InjectMetric(METRIC_ACCOUNT_BALANCE) private accountBalance: Gauge<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @Inject(WALLET_PRIVATE_KEY) private privateKey: string,
    private providerService: ProviderService,
    protected readonly config: Configuration,
  ) {}

  async onModuleInit() {
    const guardianAddress = this.address;
    register.setDefaultLabels({ guardianAddress });

    try {
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
      if (blockNumber % WALLET_BALANCE_UPDATE_BLOCK_RATE !== 0) return;
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
   * @param signDepositDataParams - parameters for signing deposit message
   * @param signDepositDataParams.prefix - unique prefix from the contract for this type of message
   * @param signDepositDataParams.depositRoot - current deposit root from the deposit contract
   * @param signDepositDataParams.nonce - current index of keys operations from the registry contract
   * @param signDepositDataParams.blockNumber - current block number
   * @param signDepositDataParams.blockHash - current block hash
   * @param signDepositDataParams.stakingModuleId - target module id
   * @returns signature
   */
  public async signDepositData({
    prefix,
    blockNumber,
    blockHash,
    depositRoot,
    nonce,
    stakingModuleId,
  }: SignDepositDataParams): Promise<Signature> {
    const encodedData = defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256'],
      [prefix, blockNumber, blockHash, depositRoot, stakingModuleId, nonce],
    );

    const messageHash = keccak256(encodedData);
    return await this.signMessage(messageHash);
  }

  /**
   * Signs a message to pause deposits
   * @param signPauseDataParams - parameters for signing pause message
   * @param signPauseDataParams.prefix - unique prefix from the contract for this type of message
   * @param signPauseDataParams.blockNumber - block number that is signed
   * @returns signature
   */
  public async signPauseDataV3({
    prefix,
    blockNumber,
  }: SignPauseDataParams): Promise<Signature> {
    const encodedData = defaultAbiCoder.encode(
      ['bytes32', 'uint256'],
      [prefix, blockNumber],
    );

    const messageHash = keccak256(encodedData);
    return this.signMessage(messageHash);
  }

  /**
   * Signs a message to pause deposits
   * @param signPauseDataParams - parameters for signing pause message
   * @param signPauseDataParams.prefix - unique prefix from the contract for this type of message
   * @param signPauseDataParams.blockNumber - block number that is signed
   * @param signPauseDataParams.stakingModuleId - target staking module id
   * @returns signature
   */
  public async signPauseDataV2({
    prefix,
    blockNumber,
    stakingModuleId,
  }: SignModulePauseDataParams): Promise<Signature> {
    const encodedData = defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'uint256'],
      [prefix, blockNumber, stakingModuleId],
    );

    const messageHash = keccak256(encodedData);
    return this.signMessage(messageHash);
  }

  /**
   * Sign a message to unvet signing keys
   * @param signUnvetDataParams - parameters for signing unvet message
   * @param signUnvetDataParams.prefix - unique prefix from the contract for this type of message
   * @param signUnvetDataParams.blockNumber - block number that is signed
   * @param signUnvetDataParams.blockHash - current block hash
   * @param signUnvetDataParams.nonce - current index of keys operations from the registry contract
   * @param signUnvetDataParams.stakingModuleId - target staking module id
   * @param signDepositDataParams.operatorIds - list of operators ids for unvetting
   * @param signDepositDataParams.vettedKeysByOperator - list of new values for vetted validators amount for operator
   * @returns
   */
  public async signUnvetData({
    prefix,
    blockNumber,
    blockHash,
    nonce,
    stakingModuleId,
    operatorIds,
    vettedKeysByOperator,
  }: SignUnvetDataParams): Promise<Signature> {
    const encodedData = utils.solidityPack(
      ['bytes32', 'uint256', 'bytes32', 'uint256', 'uint256', 'bytes', 'bytes'],
      [
        prefix,
        blockNumber,
        blockHash,
        stakingModuleId,
        nonce,
        operatorIds,
        vettedKeysByOperator,
      ],
    );

    this.logger.debug?.('Sign data:', {
      prefix,
      blockNumber,
      blockHash,
      stakingModuleId,
      nonce,
      operatorIds,
      vettedKeysByOperator,
    });

    const messageHash = keccak256(encodedData);

    this.logger.debug?.('Message hash:', {
      messageHash,
      blockHash,
      blockNumber,
    });

    return this.signMessage(messageHash);
  }
}
