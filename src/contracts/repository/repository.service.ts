import { Injectable } from '@nestjs/common';
import { Cache } from 'common/decorators';
import { LidoAbi, LidoAbi__factory } from 'generated';
import { SecurityAbi, SecurityAbi__factory } from 'generated';
import { DepositAbi, DepositAbi__factory } from 'generated';
import { StakingRouterAbi, StakingRouterAbi__factory } from 'generated';
import { ProviderService } from 'provider';
import {
  getDepositSecurityAddress,
  getLidoAddress,
} from './repository.constants';

@Injectable()
export class RepositoryService {
  constructor(private providerService: ProviderService) {}

  /**
   * Returns an instance of the Lido contract
   */
  @Cache()
  public async getCachedLidoContract(): Promise<LidoAbi> {
    const lidoAddress = await this.getLidoAddress();
    const provider = this.providerService.provider;

    return LidoAbi__factory.connect(lidoAddress, provider);
  }

  /**
   * Returns an instance of the Deposit Security contract
   */
  @Cache()
  public async getCachedSecurityContract(): Promise<SecurityAbi> {
    const securityAddress = await this.getDepositSecurityAddress();
    const provider = this.providerService.provider;

    return SecurityAbi__factory.connect(securityAddress, provider);
  }

  /**
   * Returns an instance of the Deposit contract
   */
  @Cache()
  public async getCachedDepositContract(): Promise<DepositAbi> {
    const depositAddress = await this.getDepositAddress();
    const provider = this.providerService.provider;

    return DepositAbi__factory.connect(depositAddress, provider);
  }

  /**
   * Returns an instance of the Staking Router contract
   */
  @Cache()
  public async getCachedStakingRouterAbiContract(): Promise<StakingRouterAbi> {
    const depositAddress = await this.getStakingRouterAddress();
    const provider = this.providerService.provider;

    return StakingRouterAbi__factory.connect(depositAddress, provider);
  }

  /**
   * Returns Lido contract address
   */
  public async getLidoAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getLidoAddress(chainId);
  }

  /**
   * Returns Deposit Security contract address
   */
  public async getDepositSecurityAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getDepositSecurityAddress(chainId);
  }

  /**
   * Returns Staking Router contract address
   */
  public async getStakingRouterAddress(): Promise<string> {
    const securityContract = await this.getCachedSecurityContract();
    return await securityContract.STAKING_ROUTER();
  }

  /**
   * Returns Deposit contract address
   */
  public async getDepositAddress(): Promise<string> {
    const securityContract = await this.getCachedSecurityContract();
    return await securityContract.DEPOSIT_CONTRACT();
  }
}
