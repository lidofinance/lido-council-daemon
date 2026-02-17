import { Injectable } from '@nestjs/common';
import { VerifiedDepositEvent } from 'contracts/deposits-registry';
import { BlockData, StakingModuleData } from '../interfaces';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  METRIC_VALIDATED_DEPOSITS_TOTAL,
  METRIC_DEPOSITED_KEYS_TOTAL,
  METRIC_OPERATORS_KEYS_TOTAL,
  METRIC_INTERSECTIONS_TOTAL,
  METRIC_INVALID_KEYS_TOTAL,
  METRIC_DUPLICATED_KEYS_TOTAL,
} from 'common/prometheus';
import { Gauge } from 'prom-client';

@Injectable()
export class GuardianMetricsService {
  constructor(
    @InjectMetric(METRIC_VALIDATED_DEPOSITS_TOTAL)
    private validatedDepositsCounter: Gauge<string>,

    @InjectMetric(METRIC_DEPOSITED_KEYS_TOTAL)
    private depositedKeysCounter: Gauge<string>,

    @InjectMetric(METRIC_OPERATORS_KEYS_TOTAL)
    private operatorsKeysCounter: Gauge<string>,

    @InjectMetric(METRIC_INTERSECTIONS_TOTAL)
    private intersectionsCounter: Gauge<string>,

    @InjectMetric(METRIC_DUPLICATED_KEYS_TOTAL)
    private duplicatedKeysCounter: Gauge<string>,

    @InjectMetric(METRIC_INVALID_KEYS_TOTAL)
    private invalidKeysCounter: Gauge<string>,
  ) {}

  /**
   * Collects metrics about keys in the deposit contract and keys of node operators
   * @param blockData - collected data from the current block
   */
  public collectMetrics(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): void {
    this.collectValidatingMetrics(stakingModuleData, blockData);
    this.collectDepositMetrics(stakingModuleData, blockData);
    this.collectOperatorMetrics(stakingModuleData);
  }

  /**
   * Collects metrics about validated deposits
   * @param blockData - collected data from the current block
   */
  public collectValidatingMetrics(
    { stakingModuleId }: StakingModuleData,
    blockData: BlockData,
  ): void {
    const { depositedEvents } = blockData;
    const { events } = depositedEvents;

    const valid = events.reduce((sum, { valid }) => sum + (valid ? 1 : 0), 0);
    const invalid = events.reduce((sum, { valid }) => sum + (valid ? 0 : 1), 0);

    this.validatedDepositsCounter.set(
      { type: 'valid', stakingModuleId },
      valid,
    );
    this.validatedDepositsCounter.set(
      { type: 'invalid', stakingModuleId },
      invalid,
    );
  }

  /**
   * Collects metrics about deposited keys
   * @param blockData - collected data from the current block
   */
  public collectDepositMetrics(
    { stakingModuleId }: StakingModuleData,
    blockData: BlockData,
  ): void {
    const { depositedEvents } = blockData;
    const { events } = depositedEvents;

    const depositedKeys = events.map(({ pubkey }) => pubkey);
    const depositedKeysSet = new Set(depositedKeys);

    this.depositedKeysCounter.set(
      { type: 'total', stakingModuleId },
      depositedKeys.length,
    );
    this.depositedKeysCounter.set(
      { type: 'unique', stakingModuleId },
      depositedKeysSet.size,
    );
  }

  /**
   * Collects metrics about operators keys
   * @param blockData - collected data from the current block
   */
  public collectOperatorMetrics(stakingModuleData: StakingModuleData): void {
    const { vettedUnusedKeys, stakingModuleId } = stakingModuleData;

    const operatorsKeysTotal = vettedUnusedKeys.length;
    this.operatorsKeysCounter.set(
      { type: 'vetted_unused', stakingModuleId },
      operatorsKeysTotal,
    );
  }

  /**
   * Collects metrics about keys intersections
   * @param all - all intersections
   * @param filtered - filtered intersections
   */
  public collectIntersectionsMetrics(
    stakingModuleId: number,
    all: VerifiedDepositEvent[],
    filtered: VerifiedDepositEvent[],
  ): void {
    this.intersectionsCounter.set({ type: 'all', stakingModuleId }, all.length);
    this.intersectionsCounter.set(
      { type: 'filtered', stakingModuleId },
      filtered.length,
    );
  }

  /**
   * increment duplicated vetted unused keys event counter
   */
  public collectDuplicatedKeysMetrics(
    stakingModuleId: number,
    allUnresolved: number,
    unresolved: number,
    allVettedUnused: number,
    vettedUnused: number,
  ) {
    this.duplicatedKeysCounter.set(
      { stakingModuleId, type: 'all_unresolved' },
      allUnresolved,
    );
    this.duplicatedKeysCounter.set(
      { stakingModuleId, type: 'vetted_unused_unresolved' },
      unresolved,
    );
    // resolved - SigningKeyAdded event exists
    this.duplicatedKeysCounter.set(
      { stakingModuleId, type: 'all_vetted_unused' },
      allVettedUnused,
    );
    this.duplicatedKeysCounter.set(
      { stakingModuleId, type: 'vetted_unused' },
      vettedUnused,
    );
  }

  /**
   * increment invalid keys event counter
   */
  public collectInvalidKeysMetrics(
    stakingModuleId: number,
    invalidKeysCount: number,
  ) {
    this.invalidKeysCounter.set({ stakingModuleId }, invalidKeysCount);
  }
}
