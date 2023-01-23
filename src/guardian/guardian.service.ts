import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DepositService, VerifiedDepositEvent } from 'contracts/deposit';
import { SecurityService } from 'contracts/security';
import { LidoService } from 'contracts/lido';
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
import {
  GUARDIAN_DEPOSIT_JOB_NAME,
  GUARDIAN_DEPOSIT_RESIGNING_BLOCKS,
} from './guardian.constants';
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
import { StakingRouterService } from 'staking-router';
import { SRModule } from 'keys-api/interfaces';

@Injectable()
export class GuardianService implements OnModuleInit {
  protected lastProcessedStateMeta?: { blockHash: string; blockNumber: number };

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

    private schedulerRegistry: SchedulerRegistry,

    private depositService: DepositService,
    private securityService: SecurityService,
    private providerService: ProviderService,
    private messagesService: MessagesService,
    private lidoService: LidoService,

    private stakingRouterService: StakingRouterService,
  ) {}

  public async onModuleInit(): Promise<void> {
    // Does not wait for completion, to avoid blocking the app initialization
    (async () => {
      try {
        const block = await this.providerService.getBlock();
        const blockHash = block.hash;

        await Promise.all([
          this.depositService.initialize(block.number),
          this.securityService.initialize({ blockHash }),
        ]);

        // The event cache is stored with an N block lag to avoid caching data from uncle blocks
        // so we don't worry about blockHash here
        await this.depositService.updateEventsCache();
        // Subscribes to events only after the cache is warmed up
        this.subscribeToModulesUpdates();
      } catch (error) {
        this.logger.error(error);
        process.exit(1);
      }
    })();
  }

  /**
   * Subscribes to the event of a new block appearance
   */
  public subscribeToModulesUpdates() {
    const cron = new CronJob(5_000, () => {
      this.handleNewBlock().catch((error) => {
        this.logger.error(error);
      });
    });

    this.logger.log('GuardianService subscribed to Ethereum events');

    cron.start();

    this.schedulerRegistry.addCronJob(GUARDIAN_DEPOSIT_JOB_NAME, cron);
  }

  /**
   * Handles the appearance of a new block in the network
   */
  @OneAtTime()
  public async handleNewBlock(): Promise<void> {
    this.logger.log('New block cycle start');
    const {
      elBlockSnapshot: { blockHash, blockNumber },
      data: stakingModules,
    } = await this.stakingRouterService.getStakingModules();

    if (!this.isNeedToProcessNewState({ blockHash, blockNumber })) return;

    await Promise.all(
      stakingModules.map(async (stakingRouterModule) => {
        const blockData = await this.getCurrentBlockData({
          blockHash,
          blockNumber,
          stakingRouterModule,
        });

        await Promise.all([
          this.checkKeysIntersections(blockData),
          this.depositService.handleNewBlock(blockData),
          this.pingMessageBroker(blockData),
        ]);

        this.collectMetrics(blockData);
      }),
    );

    this.setLastProcessedStateMeta({ blockHash, blockNumber });

    this.logger.log('New block cycle end');
  }

  public isNeedToProcessNewState(newMeta: {
    blockHash: string;
    blockNumber: number;
  }) {
    const lastMeta = this.lastProcessedStateMeta;
    if (!lastMeta) return true;
    if (lastMeta.blockNumber > newMeta.blockNumber) {
      this.logger.error('Keys-api returns old state', newMeta);
      return false;
    }
    return lastMeta.blockHash !== newMeta.blockHash;
  }

  public setLastProcessedStateMeta(newMeta: {
    blockHash: string;
    blockNumber: number;
  }) {
    this.lastProcessedStateMeta = newMeta;
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
  public async getCurrentBlockData({
    blockNumber,
    blockHash,
    stakingRouterModule,
  }: {
    blockNumber: number;
    blockHash: string;
    stakingRouterModule: SRModule;
  }): Promise<BlockData> {
    try {
      const endTimer = this.blockRequestsHistogram.startTimer();

      const guardianAddress = this.securityService.getGuardianAddress();
      const {
        data: {
          keys,
          module: { nonce },
        },
        meta: { elBlockSnapshot },
      } = await this.stakingRouterService.getStakingModuleUnusedKeys(
        stakingRouterModule,
      );

      if (elBlockSnapshot.blockHash !== blockHash)
        throw Error(
          'Blockhash of the received keys does not match the current blockhash',
        );

      const [depositRoot, depositedEvents, guardianIndex, isDepositsPaused] =
        await Promise.all([
          this.depositService.getDepositRoot({ blockHash }),
          this.depositService.getAllDepositedEvents(blockNumber, blockHash),
          this.securityService.getGuardianIndex({ blockHash }),
          this.securityService.isDepositsPaused(stakingRouterModule.id, {
            blockHash,
          }),
        ]);

      endTimer();

      return {
        nonce,
        unusedKeys: keys.map((srKey) => srKey.key),
        blockNumber,
        blockHash,
        depositRoot,
        depositedEvents,
        guardianAddress,
        guardianIndex,
        isDepositsPaused,
        srModuleId: stakingRouterModule.id,
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

    const keysIntersections = this.getKeysIntersections(blockData);

    const filteredIntersections = await this.excludeEligibleIntersections(
      keysIntersections,
      blockData,
    );
    const isFilteredIntersectionsFound = filteredIntersections.length > 0;

    this.collectIntersectionsMetrics(keysIntersections, filteredIntersections);

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
  public getKeysIntersections(blockData: BlockData): VerifiedDepositEvent[] {
    const { blockHash } = blockData;
    const { depositedEvents, unusedKeys } = blockData;
    const { depositRoot, nonce } = blockData;

    const unusedKeysSet = new Set(unusedKeys);
    const intersections = depositedEvents.events.filter(({ pubkey }) =>
      unusedKeysSet.has(pubkey),
    );

    if (intersections.length) {
      this.logger.warn('Already deposited keys found in the next Lido keys', {
        blockHash,
        depositRoot,
        nonce,
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
      nonce,
      srModuleId,
    } = blockData;

    if (isDepositsPaused) {
      this.logger.warn('Deposits are already paused', { blockHash });
      return;
    }

    const signature = await this.securityService.signPauseData(
      blockNumber,
      srModuleId,
    );

    const pauseMessage: MessagePause = {
      type: MessageType.PAUSE,
      depositRoot,
      nonce,
      guardianAddress,
      guardianIndex,
      blockNumber,
      blockHash,
      signature,
      srModuleId,
    };

    this.logger.warn(
      'Suspicious case detected, initialize the protocol pause',
      { blockHash },
    );

    // Call pause without waiting for completion
    this.securityService
      .pauseDeposits(blockNumber, srModuleId, signature)
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
      nonce,
      guardianAddress,
      guardianIndex,
      srModuleId,
    } = blockData;

    const currentContractState = { nonce, depositRoot, blockNumber };
    const lastContractsState = this.lastContractsState;

    this.lastContractsState = currentContractState;

    const isSameContractsState = this.isSameContractsStates(
      currentContractState,
      lastContractsState,
    );

    if (isSameContractsState) return;

    const signature = await this.securityService.signDepositData(
      depositRoot,
      nonce,
      blockNumber,
      blockHash,
      srModuleId,
    );

    const depositMessage: MessageDeposit = {
      type: MessageType.DEPOSIT,
      depositRoot,
      nonce,
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
    if (firstState.nonce !== secondState.nonce) return false;
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
    const { unusedKeys } = blockData;

    const operatorsKeysTotal = unusedKeys.length;
    this.operatorsKeysCounter.set({ type: 'total' }, operatorsKeysTotal);
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
