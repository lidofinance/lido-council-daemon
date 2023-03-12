import { Injectable } from '@nestjs/common';
import { LocatorAbi, SecurityAbi } from 'generated';
import { ProviderService } from 'provider';
import { getLidoLocatorAddress } from './locator.constants';

@Injectable()
export class LocatorService {
  constructor(private providerService: ProviderService) {}

  /**
   * Returns DSM contract address
   */
  public async getDSMAddress(lidoLocator: LocatorAbi): Promise<string> {
    return await lidoLocator.depositSecurityModule();
  }

  /**
   * Returns Lido contract address
   */
  public async getLidoAddress(lidoLocator: LocatorAbi): Promise<string> {
    return await lidoLocator.lido();
  }

  /**
   * Returns StakingRouter contract address
   */
  public async getStakingRouterAddress(
    lidoLocator: LocatorAbi,
  ): Promise<string> {
    return await lidoLocator.stakingRouter();
  }

  /**
   * Returns Deposit contract address
   */
  public async getDepositAddress(
    securityContract: SecurityAbi,
  ): Promise<string> {
    return await securityContract.DEPOSIT_CONTRACT();
  }

  /**
   * Returns Lido locator contract address
   */
  public async getLocatorAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getLidoLocatorAddress(chainId);
  }
}
