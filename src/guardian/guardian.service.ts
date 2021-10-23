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
  METRIC_DEPOSITED_KEYS_TOTAL,
  METRIC_OPERATORS_KEYS_TOTAL,
} from 'common/prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
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

    @InjectMetric(METRIC_DEPOSITED_KEYS_TOTAL)
    private depositedKeysCounter: Gauge<string>,

    @InjectMetric(METRIC_OPERATORS_KEYS_TOTAL)
    private operatorsKeysCounter: Gauge<string>,

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

    this.collectMetrics(blockData);
  }

  public async getCurrentBlockData(): Promise<BlockData> {
    try {
      const endTimer = this.blockRequestsHistogram.startTimer();

      const [
        block,
        depositRoot,
        keysOpIndex,
        nextSigningKeys,
        nodeOperatorsCache,
        depositedEvents,
        guardianIndex,
        isDepositsPaused,
      ] = await Promise.all([
        this.providerService.getBlock(),
        this.depositService.getDepositRoot(),
        this.registryService.getKeysOpIndex(),
        this.registryService.getNextSigningKeys(),
        this.registryService.getCachedNodeOperators(),
        this.depositService.getAllDepositedEvents(),
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
        nodeOperatorsCache,
        depositedEvents,
        guardianAddress,
        guardianIndex,
        isDepositsPaused,
      };
    } catch (error) {
      this.blockErrorsCounter.inc();
      throw error;
    }
  }

  public async checkKeysIntersections(blockData: BlockData): Promise<void> {
    if (blockData.isDepositsPaused) {
      this.logger.warn('Deposits are paused');
      return;
    }

    const nextKeysIntersections = this.getNextKeysIntersections(blockData);
    const cachedKeysIntersections = this.getCachedKeysIntersections(blockData);
    const intersections = nextKeysIntersections.concat(cachedKeysIntersections);
    const isIntersectionsFound = intersections.length > 0;

    if (isIntersectionsFound) {
      await this.handleKeysIntersections(blockData, intersections);
    } else {
      await this.handleCorrectKeys(blockData);
    }
  }

  public getCachedKeysIntersections(blockData: BlockData): string[] {
    const { nodeOperatorsCache, keysOpIndex, depositedEvents } = blockData;
    const { keysOpIndex: cachedKeysOpIndex, operators } = nodeOperatorsCache;
    const isCacheUpToDate = cachedKeysOpIndex === keysOpIndex;

    // Skip checking until the next cache update
    if (!isCacheUpToDate) return [];

    const depositedKeys = depositedEvents.events.map(({ pubkey }) => pubkey);
    const depositedKeysSet = new Set(depositedKeys);

    return operators.flatMap((operator) =>
      operator.keys
        .filter(({ used }) => used === false)
        .filter(({ key }) => depositedKeysSet.has(key))
        .map(({ key }) => key),
    );
  }

  public getNextKeysIntersections(blockData: BlockData): string[] {
    const { depositedEvents, nextSigningKeys } = blockData;
    const depositedKeys = depositedEvents.events.map(({ pubkey }) => pubkey);
    const depositedKeysSet = new Set(depositedKeys);

    return nextSigningKeys.filter((nextSigningKey) =>
      depositedKeysSet.has(nextSigningKey),
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

  public collectMetrics(blockData: BlockData): void {
    const { depositedEvents, nodeOperatorsCache, nextSigningKeys } = blockData;

    /* deposited keys */

    const depositedKeys = depositedEvents.events.map(({ pubkey }) => pubkey);
    const depositedKeysSet = new Set(depositedKeys);
    const depositedDubsTotal = depositedKeys.length - depositedKeysSet.size;

    this.depositedKeysCounter.set({ type: 'total' }, depositedKeys.length);
    this.depositedKeysCounter.set({ type: 'unique' }, depositedKeysSet.size);
    this.depositedKeysCounter.set({ type: 'duplicates' }, depositedDubsTotal);

    /* operators keys */

    const { operators } = nodeOperatorsCache;
    const operatorsKeys = operators.flatMap(({ keys }) => keys);
    const operatorsKeysUsed = operatorsKeys.filter(({ used }) => !!used);
    const operatorsKeysUnused = operatorsKeys.filter(({ used }) => !used);
    const operatorsKeysUsedTotal = operatorsKeysUsed.length;
    const operatorsKeysUnusedTotal = operatorsKeysUnused.length;

    this.operatorsKeysCounter.set({ type: 'total' }, operatorsKeys.length);
    this.operatorsKeysCounter.set({ type: 'used' }, operatorsKeysUsedTotal);
    this.operatorsKeysCounter.set({ type: 'unused' }, operatorsKeysUnusedTotal);
    this.operatorsKeysCounter.set({ type: 'next' }, nextSigningKeys.length);
  }
}
