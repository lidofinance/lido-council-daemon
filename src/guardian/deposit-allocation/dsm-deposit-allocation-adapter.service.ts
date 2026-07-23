import { Injectable } from '@nestjs/common';
import { BlockTag } from '@lido-nestjs/execution';
import { ethers } from 'ethers';
import { SecurityService } from 'contracts/security';
import { StakingRouterService } from 'contracts/staking-router';
import { StakingModuleData } from 'guardian/interfaces';
import {
  DSM_CONTRACT_VERSION_4,
  DSM_CONTRACT_VERSION_5,
} from 'contracts/security/security.constants';

const ONE_DEPOSIT_VALUE = ethers.utils.parseEther('32');

@Injectable()
export class DsmDepositAllocationAdapterService {
  constructor(
    private stakingRouterService: StakingRouterService,
    private securityService: SecurityService,
  ) {}

  public async isDepositBlockedByAllocation(
    stakingModuleData: StakingModuleData,
    blockHash: string,
  ): Promise<boolean> {
    const blockTag = { blockHash };
    const securityVersion = await this.securityService.version(blockTag);

    if (
      securityVersion === DSM_CONTRACT_VERSION_4 ||
      securityVersion === DSM_CONTRACT_VERSION_5
    ) {
      return false;
    }

    return this.isLegacyDepositBlockedByAllocation(stakingModuleData, blockTag);
  }

  private async isLegacyDepositBlockedByAllocation(
    stakingModuleData: StakingModuleData,
    blockTag: BlockTag,
  ): Promise<boolean> {
    const depositableEther =
      await this.stakingRouterService.getDepositableEther(blockTag);

    // DSM v3 expects the pre-v4 allocation gate: if the Lido
    // buffer is below one deposit, still check allocation with one deposit.
    const allocationCheckValue = depositableEther.gt(ONE_DEPOSIT_VALUE)
      ? depositableEther
      : ONE_DEPOSIT_VALUE;

    const maxDepositsCount =
      await this.stakingRouterService.getStakingModuleMaxDepositsCount(
        stakingModuleData.stakingModuleId,
        allocationCheckValue,
        blockTag,
      );

    const hasDepositsAllocation = maxDepositsCount > 0;

    return !hasDepositsAllocation;
  }
}
