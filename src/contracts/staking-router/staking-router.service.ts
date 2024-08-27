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

  /**
   * Returns the current state of deposits for module
   */
  public async isModuleDepositsPaused(
    stakingModuleId: number,
    blockTag?: BlockTag,
  ): Promise<boolean> {
    const stakingRouterContract =
      await this.repositoryService.getCachedStakingRouterContract();

    const isActive = await stakingRouterContract.getStakingModuleIsActive(
      stakingModuleId,
      {
        blockTag: blockTag as any,
      },
    );

    return !isActive;
  }

  public async getWithdrawalCredentials(blockTag?: BlockTag): Promise<string> {
    const stakingRouterContract =
      await this.repositoryService.getCachedStakingRouterContract();

    return await stakingRouterContract.getWithdrawalCredentials({
      blockTag: blockTag as any,
    });
  }
}

// describe('isDepositsPaused', () => {
//   it('should call contract method', async () => {
//     const expected = true;

//     const mockProviderCalla = jest
//       .spyOn(providerService.provider, 'call')
//       .mockImplementation(async () => {
//         const iface = new Interface(StakingRouterAbi__factory.abi);
//         return iface.encodeFunctionResult('getStakingModuleIsActive', [
//           expected,
//         ]);
//       });

//     const isPaused = await securityService.isModuleDepositsPaused(
//       TEST_MODULE_ID,
//     );
//     expect(isPaused).toBe(!expected);
//     expect(mockProviderCalla).toBeCalledTimes(1);
//   });
// });

// describe('getWithdrawalCredentials', () => {
//   it('should return withdrawal credentials', async () => {
//     const expected = '0x' + '1'.repeat(64);

//     const mockProviderCall = jest
//       .spyOn(providerService.provider, 'call')
//       .mockImplementation(async () => {
//         const iface = new Interface(LidoAbi__factory.abi);
//         const result = [expected];
//         return iface.encodeFunctionResult('getWithdrawalCredentials', result);
//       });

//     const wc = await lidoService.getWithdrawalCredentials();
//     expect(wc).toBe(expected);
//     expect(mockProviderCall).toBeCalledTimes(1);
//   });
// });
