import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { Block } from '@ethersproject/providers';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DepositService, VerifiedDepositEvent } from 'contracts/deposit';
import { RegistryService } from 'contracts/registry';
import { SecurityService } from 'contracts/security';
import { LidoService } from 'contracts/lido';
import { RepositoryService } from 'contracts/repository';
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
  METRIC_VALIDATED_DEPOSITS_TOTAL,
  METRIC_DEPOSITED_KEYS_TOTAL,
  METRIC_OPERATORS_KEYS_TOTAL,
  METRIC_INTERSECTIONS_TOTAL,
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

    @InjectMetric(METRIC_VALIDATED_DEPOSITS_TOTAL)
    private validatedDepositsCounter: Gauge<string>,

    @InjectMetric(METRIC_DEPOSITED_KEYS_TOTAL)
    private depositedKeysCounter: Gauge<string>,

    @InjectMetric(METRIC_OPERATORS_KEYS_TOTAL)
    private operatorsKeysCounter: Gauge<string>,

    @InjectMetric(METRIC_INTERSECTIONS_TOTAL)
    private intersectionsCounter: Gauge<string>,

    private registryService: RegistryService,
    private depositService: DepositService,
    private securityService: SecurityService,
    private providerService: ProviderService,
    private messagesService: MessagesService,
    private repositoryService: RepositoryService,
    private lidoService: LidoService,
  ) {}

  public async onModuleInit(): Promise<void> {
    // Does not wait for completion, to avoid blocking the app initialization
    (async () => {
      try {
        const block = await this.providerService.getBlock();
        const blockHash = block.hash;

        await Promise.all([
          this.registryService.initialize(),
          this.depositService.initialize(block.number),
          this.securityService.initialize({ blockHash }),
        ]);

        await Promise.all([
          // The event cache is stored with an N block lag to avoid caching data from uncle blocks
          // so we don't worry about blockHash here
          this.depositService.updateEventsCache(),
          this.registryService.updateNodeOperatorsCache({ blockHash }),
        ]);

        // Subscribes to events only after the cache is warmed up
        this.subscribeToEthereumUpdates();
      } catch (error) {
        this.logger.error(error);
        process.exit(1);
      }
    })();
  }

  /**
   * Subscribes to the event of a new block appearance
   */
  public subscribeToEthereumUpdates() {
    const provider = this.providerService.provider;

    provider.on('block', () => this.handleNewBlock());
    this.logger.log('GuardianService subscribed to Ethereum events');
  }

  /**
   * Handles the appearance of a new block in the network
   */
  @OneAtTime()
  public async handleNewBlock(): Promise<void> {
    this.logger.log('New block cycle start');

    const block = await this.providerService.getBlock();
    const blockData = await this.getCurrentBlockData(block);

    await Promise.all([
      this.checkKeysIntersections(blockData),
      this.depositService.handleNewBlock(blockData),
      this.registryService.handleNewBlock(blockData),
      this.pingMessageBroker(blockData),
    ]);

    this.collectMetrics(blockData);
    this.logger.log('New block cycle end');
  }

  /**
   * Sends a ping message to the message broker
   * @param blockData - collected data from the current block
   */
  public async pingMessageBroker(blockData: BlockData): Promise<void> {
    const { blockNumber, guardianIndex, guardianAddress } = blockData;

    await this.sendMessageFromGuardian({
      type: MessageType.PING,
      blockNumber,
      guardianIndex,
      guardianAddress,
    });
  }

  /**
   * Collects data from contracts in one place and by block hash,
   * to reduce the probability of getting data from different blocks
   * @returns collected data from the current block
   */
  public async getCurrentBlockData(block: Block): Promise<BlockData> {
    try {
      const endTimer = this.blockRequestsHistogram.startTimer();

      const guardianAddress = this.securityService.getGuardianAddress();

      const blockNumber = block.number;
      const blockHash = block.hash;

      const [
        nodeOperatorsCache,
        keysOpIndex,
        nextSigningKeys,
        depositRoot,
        depositedEvents,
        guardianIndex,
        isDepositsPaused,
      ] = await Promise.all([
        this.registryService.getCachedNodeOperators(),
        this.registryService.getKeysOpIndex({ blockHash }),
        this.registryService.getNextSigningKeys({ blockHash }),
        this.depositService.getDepositRoot({ blockHash }),
        this.depositService.getAllDepositedEvents(blockNumber, blockHash),
        this.securityService.getGuardianIndex({ blockHash }),
        this.securityService.isDepositsPaused({ blockHash }),
      ]);

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

  /**
   * Checks keys for intersections with previously deposited keys and handles the situation
   * @param blockData - collected data from the current block
   */
  public async checkKeysIntersections(blockData: BlockData): Promise<void> {
    const { blockHash } = blockData;

    const nextKeysIntersections = this.getNextKeysIntersections(blockData);
    const cachedKeysIntersections = this.getCachedKeysIntersections(blockData);
    const intersections = nextKeysIntersections.concat(cachedKeysIntersections);
    const filteredIntersections = await this.excludeEligibleIntersections(
      intersections,
      blockData,
    );
    const isFilteredIntersectionsFound = filteredIntersections.length > 0;

    this.collectIntersectionsMetrics(intersections, filteredIntersections);

    if (blockData.isDepositsPaused) {
      this.logger.warn('Deposits are paused', { blockHash });
      return;
    }

    if (isFilteredIntersectionsFound) {
      await this.handleKeysIntersections(blockData);
    } else {
      await this.handleCorrectKeys(blockData);
    }
  }

  /**
   * Finds the intersection of the next deposit keys in the list of all previously deposited keys
   * Quick check that can be done on each block
   * @param blockData - collected data from the current block
   * @returns list of keys that were deposited earlier
   */
  public getNextKeysIntersections(
    blockData: BlockData,
  ): VerifiedDepositEvent[] {
    const { blockHash } = blockData;
    const { depositedEvents, nextSigningKeys } = blockData;
    const { depositRoot, keysOpIndex } = blockData;

    const nextSigningKeysSet = new Set(nextSigningKeys);
    const intersections = depositedEvents.events.filter(({ pubkey }) =>
      nextSigningKeysSet.has(pubkey),
    );

    if (intersections.length) {
      this.logger.warn('Already deposited keys found in the next Lido keys', {
        blockHash,
        depositRoot,
        keysOpIndex,
        intersections,
      });
    }

    return intersections;
  }

  /**
   * Finds the intersection of all unused lido keys in the list of all previously deposited keys
   * It may not run every block if the cache is being updated.
   * @param blockData - collected data from the current block
   * @returns list of keys that were deposited earlier
   */
  public getCachedKeysIntersections(
    blockData: BlockData,
  ): VerifiedDepositEvent[] {
    const { blockHash } = blockData;
    const { keysOpIndex, depositRoot, depositedEvents } = blockData;
    const cache = blockData.nodeOperatorsCache;

    const isSameKeysOpIndex = cache.keysOpIndex === keysOpIndex;
    const isSameDepositRoot = cache.depositRoot === depositRoot;
    const isCacheUpToDate = isSameKeysOpIndex && isSameDepositRoot;

    // Skip checking until the next cache update
    if (!isCacheUpToDate) return [];

    const unusedOperatorsKeys = cache.operators.flatMap((operator) =>
      operator.keys.filter(({ used }) => used === false).map(({ key }) => key),
    );
    const unusedOperatorsKeysSet = new Set(unusedOperatorsKeys);

    const intersections = depositedEvents.events.filter(({ pubkey }) =>
      unusedOperatorsKeysSet.has(pubkey),
    );

    if (intersections.length) {
      this.logger.warn('Already deposited keys found in operators cache', {
        blockHash,
        keysOpIndex,
        depositRoot,
        intersections,
      });
    }

    return intersections;
  }

  /**
   * Excludes invalid deposits and deposits with Lido WC from intersections
   * @param intersections - list of deposits with keys that were deposited earlier
   * @param blockData - collected data from the current block
   */
  public async excludeEligibleIntersections(
    intersections: VerifiedDepositEvent[],
    blockData: BlockData,
  ): Promise<VerifiedDepositEvent[]> {
    // Exclude deposits with invalid signature over the deposit data
    const validIntersections = intersections.filter(({ valid }) => valid);
    if (!validIntersections.length) return [];

    // Exclude deposits with Lido withdrawal credentials
    const { blockHash } = blockData;
    const lidoWC = await this.lidoService.getWithdrawalCredentials({
      blockHash,
    });
    const attackIntersections = validIntersections.filter(
      (deposit) => deposit.wc !== lidoWC,
    );

    return attackIntersections;
  }

  /**
   * Handles the situation when keys have previously deposited copies
   * @param blockData - collected data from the current block
   */
  public async handleKeysIntersections(blockData: BlockData): Promise<void> {
    const {
      blockNumber,
      blockHash,
      guardianAddress,
      guardianIndex,
      isDepositsPaused,
      depositRoot,
      keysOpIndex,
    } = blockData;

    if (isDepositsPaused) {
      this.logger.warn('Deposits are already paused', { blockHash });
      return;
    }

    const signature = await this.securityService.signPauseData(blockNumber);

    const pauseMessage: MessagePause = {
      type: MessageType.PAUSE,
      depositRoot,
      keysOpIndex,
      guardianAddress,
      guardianIndex,
      blockNumber,
      blockHash,
      signature,
    };

    this.logger.warn(
      'Suspicious case detected, initialize the protocol pause',
      { blockHash },
    );

    // Call pause without waiting for completion
    this.securityService
      .pauseDeposits(blockNumber, signature)
      .catch((error) => this.logger.error(error));

    await this.sendMessageFromGuardian(pauseMessage);
  }

  /**
   * Handles the situation when keys do not have previously deposited copies
   * @param blockData - collected data from the current block
   */
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

    this.logger.log('No problems found', {
      blockHash,
      lastState: lastContractsState,
      newState: currentContractState,
    });

    await this.sendMessageFromGuardian(depositMessage);
  }

  private lastContractsState: ContractsState | null = null;

  /**
   * Compares the states of the contracts to decide if the message needs to be re-signed
   * @param firstState - contracts state
   * @param secondState - contracts state
   * @returns true if state is the same
   */
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

  /**
   * Adds information about the app to the message
   * @param message - message object
   * @returns extended message
   */
  public addMessageMetaData<T>(message: T): T & MessageMeta {
    return {
      ...message,
      app: { version: APP_VERSION, name: APP_NAME },
    };
  }

  /**
   * Sends a message to the message broker from the guardian
   * @param messageData - message object
   */
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

    this.logger.log('Sending a message to broker', messageData);
    await this.messagesService.sendMessage(messageWithMeta);
  }

  /**
   * Collects metrics about keys in the deposit contract and keys of node operators
   * @param blockData - collected data from the current block
   */
  public collectMetrics(blockData: BlockData): void {
    this.collectValidatingMetrics(blockData);
    this.collectDepositMetrics(blockData);
    this.collectOperatorMetrics(blockData);
  }

  /**
   * Collects metrics about validated deposits
   * @param blockData - collected data from the current block
   */
  public collectValidatingMetrics(blockData: BlockData): void {
    const { depositedEvents } = blockData;
    const { events } = depositedEvents;

    const valid = events.reduce((sum, { valid }) => sum + (valid ? 1 : 0), 0);
    const invalid = events.reduce((sum, { valid }) => sum + (valid ? 0 : 1), 0);

    this.validatedDepositsCounter.set({ type: 'valid' }, valid);
    this.validatedDepositsCounter.set({ type: 'invalid' }, invalid);
  }

  /**
   * Collects metrics about deposited keys
   * @param blockData - collected data from the current block
   */
  public collectDepositMetrics(blockData: BlockData): void {
    const { depositedEvents } = blockData;
    const { events } = depositedEvents;

    const depositedKeys = events.map(({ pubkey }) => pubkey);
    const depositedKeysSet = new Set(depositedKeys);
    const depositedDubsTotal = depositedKeys.length - depositedKeysSet.size;

    this.depositedKeysCounter.set({ type: 'total' }, depositedKeys.length);
    this.depositedKeysCounter.set({ type: 'unique' }, depositedKeysSet.size);
    this.depositedKeysCounter.set({ type: 'duplicates' }, depositedDubsTotal);
  }

  /**
   * Collects metrics about operators keys
   * @param blockData - collected data from the current block
   */
  public collectOperatorMetrics(blockData: BlockData): void {
    const { nodeOperatorsCache, nextSigningKeys } = blockData;

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

  /**
   * Collects metrics about keys intersections
   * @param all - all intersections
   * @param filtered - all intersections
   */
  public collectIntersectionsMetrics(
    all: VerifiedDepositEvent[],
    filtered: VerifiedDepositEvent[],
  ): void {
    this.intersectionsCounter.set({ type: 'all' }, all.length);
    this.intersectionsCounter.set({ type: 'filtered' }, filtered.length);
  }
}
