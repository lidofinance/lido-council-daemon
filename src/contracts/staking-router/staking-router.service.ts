import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { RepositoryService } from 'contracts/repository';
import { IStakingModuleAbi__factory } from 'generated';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BlockTag, ProviderService } from 'provider';

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private repositoryService: RepositoryService,
  ) {}

  /**
   * @param blockTag
   * @returns List of staking modules fetch from SR contract
   */
  public async getStakingModules(blockTag: BlockTag) {
    const stakingRouter =
      await this.repositoryService.getCachedStakingRouterContract();
    const stakingModules = await stakingRouter.getStakingModules({
      blockTag: blockTag as any,
    });

    return stakingModules;
  }

  public async getStakingModule(stakingModuleAddress: string) {
    return IStakingModuleAbi__factory.connect(
      stakingModuleAddress,
      this.providerService.provider,
    );
  }

  public async getSigningKeyAddedEvents(
    startBlock: number,
    endBlock: number,
    address: string,
  ) {
    const contract = await this.getStakingModule(address);
    const filter = contract.filters['SigningKeyAdded(uint256,bytes)']();

    return await contract.queryFilter(filter, startBlock, endBlock);
  }
}
