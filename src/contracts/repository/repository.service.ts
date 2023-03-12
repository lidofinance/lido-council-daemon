import { Inject, Injectable, LoggerService } from '@nestjs/common';
import {
  LidoAbi,
  LidoAbi__factory,
  LocatorAbi,
  LocatorAbi__factory,
} from 'generated';
import { SecurityAbi, SecurityAbi__factory } from 'generated';
import { DepositAbi, DepositAbi__factory } from 'generated';
import { StakingRouterAbi, StakingRouterAbi__factory } from 'generated';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ProviderService } from 'provider';
import { LocatorService } from './locator/locator.service';
import {
  DEPOSIT_ABI,
  DSM_ABI,
  LIDO_ABI,
  STAKING_ROUTER_ABI,
} from './repository.constants';

@Injectable()
export class RepositoryService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private locatorService: LocatorService,
  ) {}
  private contractsCache: Record<
    string,
    LidoAbi | LocatorAbi | SecurityAbi | DepositAbi | StakingRouterAbi
  > = {};

  /**
   * Init cache for each contract
   */
  public async initCachedContracts() {
    const lidoLocator = await this.getLidoLocatorAbiContract();

    const lidoAddress = await this.locatorService.getLidoAddress(lidoLocator);
    const dsmAddress = await this.locatorService.getDSMAddress(lidoLocator);

    await this.initCachedLidoContract(lidoAddress);
    await this.initCachedDSMContract(dsmAddress);
    await this.initCachedDepositContract();
    await this.initCachedStakingRouterAbiContract(lidoLocator);
  }

  /**
   * Get Lido contract impl
   */
  public getLidoContract(): LidoAbi {
    return this.getFromCache(LIDO_ABI) as LidoAbi;
  }

  /**
   * Get DSM contract impl
   */
  public getDSMContract(): SecurityAbi {
    return this.getFromCache(DSM_ABI) as SecurityAbi;
  }

  /**
   * Get Deposit contract impl
   */
  public getDepositContract(): DepositAbi {
    return this.getFromCache(DEPOSIT_ABI) as DepositAbi;
  }

  /**
   * Get SR contract impl
   */
  public getStakingRouterContract(): StakingRouterAbi {
    return this.getFromCache(STAKING_ROUTER_ABI) as StakingRouterAbi;
  }

  /**
   * Get cached contract impl
   */
  private getFromCache(abiKey: string) {
    const contract = this.contractsCache[abiKey];
    if (contract) return contract;
    throw new Error(`Not found ABI for key: ${abiKey}`);
  }

  /**
   * Set contract impl and log on event
   */
  private setImplementation(
    address: string,
    contractKey: string,
    impl: LidoAbi | LocatorAbi | SecurityAbi | DepositAbi | StakingRouterAbi,
  ) {
    if (!this.contractsCache[contractKey]) {
      this.logger.log('Init implementation', { address, contractKey });
    }

    if (
      this.contractsCache[contractKey] &&
      this.contractsCache[contractKey].address !== address
    ) {
      this.logger.log('Implementation was changed', { address, contractKey });
    }

    this.contractsCache[contractKey] = impl;
  }

  /**
   * Init cache for Lido contract
   */
  private async initCachedLidoContract(lidoAddress: string): Promise<void> {
    const provider = this.providerService.provider;

    this.setImplementation(
      lidoAddress,
      LIDO_ABI,
      LidoAbi__factory.connect(lidoAddress, provider),
    );
  }

  /**
   * Init cache for DSM contract
   */
  private async initCachedDSMContract(dsmAddress: string): Promise<void> {
    const provider = this.providerService.provider;

    this.setImplementation(
      dsmAddress,
      DSM_ABI,
      SecurityAbi__factory.connect(dsmAddress, provider),
    );
  }

  /**
   * Init cache for Deposit contract
   */
  private async initCachedDepositContract(): Promise<void> {
    const securityContract = this.getDSMContract();
    const depositAddress = await this.locatorService.getDepositAddress(
      securityContract,
    );

    const provider = this.providerService.provider;

    this.setImplementation(
      depositAddress,
      DEPOSIT_ABI,
      DepositAbi__factory.connect(depositAddress, provider),
    );
  }

  /**
   * Init cache for SR contract
   */
  private async initCachedStakingRouterAbiContract(
    lidoLocator: LocatorAbi,
  ): Promise<void> {
    const stakingRouterAddress =
      await this.locatorService.getStakingRouterAddress(lidoLocator);
    const provider = this.providerService.provider;

    this.setImplementation(
      stakingRouterAddress,
      STAKING_ROUTER_ABI,
      StakingRouterAbi__factory.connect(stakingRouterAddress, provider),
    );
  }

  /**
   * Get Lido locator contract
   */
  private async getLidoLocatorAbiContract() {
    const locatorAddress = await this.locatorService.getLocatorAddress();
    const provider = this.providerService.provider;

    return LocatorAbi__factory.connect(locatorAddress, provider);
  }
}
