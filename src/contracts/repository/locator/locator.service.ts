import { Injectable } from '@nestjs/common';
import { LocatorAbi, LocatorAbi__factory } from 'generated';
import { BlockTag } from 'provider';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { LIDO_LOCATOR_BY_NETWORK } from './locator.constants';
import { Configuration } from 'common/config';

@Injectable()
export class LocatorService {
  constructor(
    private readonly provider: SimpleFallbackJsonRpcBatchProvider,
    private readonly config: Configuration,
  ) {}
  private cachedLidoLocatorContract: LocatorAbi | undefined;
  /**
   * Returns DSM contract address
   */
  public async getDSMAddress(blockTag: BlockTag): Promise<string> {
    const lidoLocator = await this.getLidoLocatorAbiContract();
    return await lidoLocator.depositSecurityModule({
      blockTag: blockTag as any,
    });
  }

  /**
   * Returns Lido contract address
   */
  public async getLidoAddress(blockTag: BlockTag): Promise<string> {
    const lidoLocator = await this.getLidoLocatorAbiContract();
    return await lidoLocator.lido({ blockTag: blockTag as any });
  }
  /**
   * Returns StakingRouter contract address
   */
  public async getStakingRouterAddress(blockTag: BlockTag): Promise<string> {
    const lidoLocator = await this.getLidoLocatorAbiContract();
    return await lidoLocator.stakingRouter({ blockTag: blockTag as any });
  }
  /**
   * Get Lido locator contract
   */
  public async getLidoLocatorAbiContract(): Promise<LocatorAbi> {
    if (this.cachedLidoLocatorContract) return this.cachedLidoLocatorContract;
    const locatorAddress = await this.getLocatorAddress();

    this.cachedLidoLocatorContract = LocatorAbi__factory.connect(
      locatorAddress,
      this.provider,
    );
    return this.cachedLidoLocatorContract;
  }

  /**
   * Get Lido locator address from config or network
   */
  public async getLocatorAddress(): Promise<string> {
    const network = await this.provider.getNetwork();
    const chainId = network.chainId;

    const address =
      this.config.LOCATOR_DEVNET_ADDRESS || LIDO_LOCATOR_BY_NETWORK[chainId];
    if (!address) throw new Error(`Chain ${chainId} is not supported`);

    return address;
  }
}
