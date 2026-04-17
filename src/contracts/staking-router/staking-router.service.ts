import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { RepositoryService } from 'contracts/repository';
import { IStakingModuleAbi__factory } from 'generated';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BlockTag } from '@lido-nestjs/execution';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { BigNumber } from '@ethersproject/bignumber';

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private provider: SimpleFallbackJsonRpcBatchProvider,
    private repositoryService: RepositoryService,
  ) {}

  /**
   * @param blockTag
   * @returns List of staking modules fetched from the SR contract.
   * Before SRv3 release modules had only 0x01 types of keys and withdrawalCredentialsType diesnd does not exist in module' struct
   * So for staking router version == 3, will set withdrawalCredentialsType = 1
   * TODO: remove SR v3 branch after voting
   */
  public async getStakingModules(blockTag: BlockTag) {
    const stakingRouter =
      this.repositoryService.getCachedStakingRouterContract();

    const [stakingModules, version] = await Promise.all([
      stakingRouter.getStakingModules({
        blockTag: blockTag as any,
      }),
      this.getContractVersion(blockTag),
    ]);

    if (version < 4) {
      return stakingModules.map((m) => ({
        ...m,
        withdrawalCredentialsType: 1,
      }));
    }

    return stakingModules;
  }

  /**
   * Retrieves the list of staking module addresses.
   * This method fetches the cached staking modules contracts and returns the list of staking module addresses.
   * @param blockHash - Block hash
   * @returns Array of staking module addresses.
   */
  public async getStakingModulesAddresses(
    blockHash: string,
  ): Promise<string[]> {
    const stakingModules = await this.getStakingModules({ blockHash });

    return stakingModules.map(
      (stakingModule) => stakingModule.stakingModuleAddress,
    );
  }

  /**
   * Retrieves contract factory
   * @param stakingModuleAddress Staking module address
   * @returns Contract factory
   */
  public async getStakingModule(stakingModuleAddress: string) {
    return IStakingModuleAbi__factory.connect(
      stakingModuleAddress,
      this.provider,
    );
  }

  /**
   * Retrieves SigningKeyAdded events list
   * @param startBlock - Start block for fetching events
   * @param endBlock - End block for fetching events
   * @param stakingModuleAddress - Staking module address
   * @returns List of SigningKeyAdded events
   */
  public async getSigningKeyAddedEvents(
    startBlock: number,
    endBlock: number,
    stakingModuleAddress: string,
  ) {
    const contract = await this.getStakingModule(stakingModuleAddress);
    const filter = contract.filters['SigningKeyAdded(uint256,bytes)']();

    return await contract.queryFilter(filter, startBlock, endBlock);
  }

  /**
   * Returns the current state of deposits for module
   */
  public async isModuleDepositsPaused(
    stakingModuleId: number,
    blockTag?: BlockTag,
  ): Promise<boolean> {
    const stakingRouterContract =
      this.repositoryService.getCachedStakingRouterContract();

    const isActive = await stakingRouterContract.getStakingModuleIsActive(
      stakingModuleId,
      {
        blockTag: blockTag as any,
      },
    );

    return !isActive;
  }

  /**
   * Returns the maximum number of new deposits that can be made to a staking module
   * given the available depositable ether.
   */
  public async getStakingModuleMaxDepositsCount(
    stakingModuleId: number,
    maxDepositsValue: BigNumber,
    blockTag?: BlockTag,
  ): Promise<number> {
    const stakingRouterContract =
      this.repositoryService.getCachedStakingRouterContract();

    try {
      const result =
        await stakingRouterContract.getStakingModuleMaxDepositsCount(
          stakingModuleId,
          maxDepositsValue,
          {
            blockTag: blockTag as any,
          },
        );

      return result.toNumber();
    } catch (error) {
      // Reproduced only on fork tests with artificially corrupted module state:
      // operator count is cut without keeping all module summary/key counters in sync.
      // This state is not reachable via normal prod flows, but guardian must still
      // degrade safely: skip deposits for the broken module and continue checks/unvet
      // for the rest of modules/operators instead of aborting the whole cycle.
      if (this.isNoAllocationMathUnderflow(error)) {
        this.logger.warn('Treat staking module allocation underflow as zero', {
          stakingModuleId,
          maxDepositsValue: maxDepositsValue.toString(),
        });
        return 0;
      }

      throw error;
    }
  }

  /**
   * Returns the amount of ether available for deposits from the Lido buffer.
   */
  public async getDepositableEther(blockTag?: BlockTag): Promise<BigNumber> {
    const lidoContract = this.repositoryService.getCachedLidoContract();

    return await lidoContract.getDepositableEther({
      blockTag: blockTag as any,
    });
  }

  public async getWithdrawalCredentials(blockTag?: BlockTag): Promise<string> {
    const stakingRouterContract =
      this.repositoryService.getCachedStakingRouterContract();

    return await stakingRouterContract.getWithdrawalCredentials({
      blockTag: blockTag as any,
    });
  }

  /**
   * Returns the on-chain version of the Staking Router contract.
   * SR v3 does not have withdrawalCredentialsType in module struct.
   * SR v4 introduces per-module withdrawalCredentialsType.
   */
  public async getContractVersion(blockTag?: BlockTag): Promise<number> {
    const stakingRouterContract =
      this.repositoryService.getCachedStakingRouterContract();

    const version = await stakingRouterContract.getContractVersion({
      blockTag: blockTag as any,
    });

    return version.toNumber();
  }

  private isNoAllocationMathUnderflow(error: unknown): boolean {
    const callError = error as
      | {
          code?: string;
          reason?: string;
          message?: string;
        }
      | undefined;

    return (
      callError?.code === 'CALL_EXCEPTION' &&
      (callError.reason === 'MATH_SUB_UNDERFLOW' ||
        callError.message?.includes('MATH_SUB_UNDERFLOW') === true)
    );
  }
}
