import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DepositService } from 'contracts/deposit';
import { RegistryService } from 'contracts/registry';
import { SecurityService } from 'contracts/security';
import { ProviderService } from 'provider';
import {
  MessageDeposit,
  MessageMeta,
  MessagePause,
  MessageRequiredFields,
  MessagesService,
  MessageType,
} from 'messages';
import { ContractsState, BlockData } from './interfaces';
import { GUARDIAN_DEPOSIT_RESIGNING_BLOCKS } from './guardian.constants';
import { OneAtTime } from 'common/decorators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  METRIC_BLOCK_DATA_REQUEST_DURATION,
  METRIC_BLOCK_DATA_REQUEST_ERRORS,
} from 'common/prometheus';
import { Counter, Histogram } from 'prom-client';
import { APP_NAME, APP_VERSION } from 'app.constants';

@Injectable()
export class GuardianService implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,

    @InjectMetric(METRIC_BLOCK_DATA_REQUEST_DURATION)
    private blockRequestsHistogram: Histogram<string>,

    @InjectMetric(METRIC_BLOCK_DATA_REQUEST_ERRORS)
    private blockErrorsCounter: Counter<string>,

    private registryService: RegistryService,
    private depositService: DepositService,
    private securityService: SecurityService,
    private providerService: ProviderService,
    private messagesService: MessagesService,
  ) {}

  public async onModuleInit(): Promise<void> {
    (async () => {
      await Promise.all([
        this.depositService.updateEventsCache(),
        this.registryService.updateNodeOperatorsCache(),
      ]);
      this.subscribeToEthereumUpdates();
    })();
  }

  public subscribeToEthereumUpdates() {
    const provider = this.providerService.provider;

    provider.on('block', () => this.handleNewBlock());
    this.logger.log('GuardianService subscribed to Ethereum events');
  }

  @OneAtTime()
  public async handleNewBlock(): Promise<void> {
    const blockData = await this.getCurrentBlockData();

    await Promise.all([
      this.checkKeysIntersections(blockData),
      this.depositService.handleNewBlock(blockData),
      this.registryService.handleNewBlock(blockData),
    ]);
  }

  public async checkKeysIntersections(blockData: BlockData): Promise<void> {
    const { nextSigningKeys, depositedPubKeys, isDepositsPaused } = blockData;

    if (isDepositsPaused) {
      this.logger.warn('Deposits are paused');
      return;
    }

    // TODO: check intersection with all lido keys
    const intersections = this.getKeysIntersections(
      nextSigningKeys,
      depositedPubKeys,
    );

    const isIntersectionsFound = intersections.length > 0;

    if (isIntersectionsFound) {
      await this.handleKeysIntersections(blockData, intersections);
    } else {
      await this.handleCorrectKeys(blockData);
    }
  }

  public async getCurrentBlockData(): Promise<BlockData> {
    try {
      const endTimer = this.blockRequestsHistogram.startTimer();

      const [
        block,
        depositRoot,
        keysOpIndex,
        nextSigningKeys,
        depositedPubKeys,
        guardianIndex,
        isDepositsPaused,
      ] = await Promise.all([
        this.providerService.getBlock(),
        this.depositService.getDepositRoot(),
        this.registryService.getKeysOpIndex(),
        this.registryService.getNextSigningKeys(),
        this.depositService.getAllDepositedPubKeys(),
        this.securityService.getGuardianIndex(),
        this.securityService.isDepositsPaused(),
      ]);

      const guardianAddress = this.securityService.getGuardianAddress();
      const blockNumber = block.number;
      const blockHash = block.hash;

      endTimer();

      return {
        blockNumber,
        blockHash,
        depositRoot,
        keysOpIndex,
        nextSigningKeys,
        depositedPubKeys,
        guardianAddress,
        guardianIndex,
        isDepositsPaused,
      };
    } catch (error) {
      this.blockErrorsCounter.inc();
      throw error;
    }
  }

  public getKeysIntersections(
    nextSigningKeys: string[],
    depositedPubKeys: Set<string>,
  ): string[] {
    return nextSigningKeys.filter((nextSigningKey) =>
      depositedPubKeys.has(nextSigningKey),
    );
  }

  public async handleKeysIntersections(
    blockData: BlockData,
    intersections: string[],
  ): Promise<void> {
    const {
      blockNumber,
      blockHash,
      guardianAddress,
      guardianIndex,
      isDepositsPaused,
    } = blockData;

    this.logger.warn('Already deposited keys found', { keys: intersections });

    if (isDepositsPaused) {
      this.logger.warn('Deposits are already paused');
      return;
    }

    const signature = await this.securityService.signPauseData(blockNumber);

    const pauseMessage: MessagePause = {
      type: MessageType.PAUSE,
      guardianAddress,
      guardianIndex,
      blockNumber,
      blockHash,
      signature,
    };

    // call without waiting for completion
    this.securityService.pauseDeposits(blockNumber, signature);

    this.logger.warn('Suspicious case detected', pauseMessage);
    await this.sendMessageFromGuardian(pauseMessage);
  }

  public async handleCorrectKeys(blockData: BlockData): Promise<void> {
    const {
      blockNumber,
      blockHash,
      depositRoot,
      keysOpIndex,
      guardianAddress,
      guardianIndex,
    } = blockData;

    const currentContractState = { keysOpIndex, depositRoot, blockNumber };
    const lastContractsState = this.lastContractsState;

    this.lastContractsState = currentContractState;

    const isSameContractsState = this.isSameContractsStates(
      currentContractState,
      lastContractsState,
    );

    if (isSameContractsState) return;

    const signature = await this.securityService.signDepositData(
      depositRoot,
      keysOpIndex,
      blockNumber,
      blockHash,
    );

    const depositMessage: MessageDeposit = {
      type: MessageType.DEPOSIT,
      depositRoot,
      keysOpIndex,
      blockNumber,
      blockHash,
      guardianAddress,
      guardianIndex,
      signature,
    };

    this.logger.log('No problems found', depositMessage);
    await this.sendMessageFromGuardian(depositMessage);
  }

  private lastContractsState: ContractsState | null = null;

  public isSameContractsStates(
    firstState: ContractsState | null,
    secondState: ContractsState | null,
  ): boolean {
    if (!firstState || !secondState) return false;
    if (firstState.depositRoot !== secondState.depositRoot) return false;
    if (firstState.keysOpIndex !== secondState.keysOpIndex) return false;
    if (
      Math.floor(firstState.blockNumber / GUARDIAN_DEPOSIT_RESIGNING_BLOCKS) !==
      Math.floor(secondState.blockNumber / GUARDIAN_DEPOSIT_RESIGNING_BLOCKS)
    ) {
      return false;
    }

    return true;
  }

  public addMessageMetaData<T>(message: T): T & MessageMeta {
    return {
      ...message,
      app: { version: APP_VERSION, name: APP_NAME },
    };
  }

  public async sendMessageFromGuardian<T extends MessageRequiredFields>(
    messageData: T,
  ): Promise<void> {
    if (messageData.guardianIndex == -1) {
      this.logger.warn(
        'Your address is not in the Guardian List. The message will not be sent',
      );

      return;
    }

    const messageWithMeta = this.addMessageMetaData(messageData);
    await this.messagesService.sendMessage(messageWithMeta);
  }
}
