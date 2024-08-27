import { Block } from '@ethersproject/abstract-provider';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { LidoAbi, LidoAbi__factory, LocatorAbi } from 'generated';
import { SecurityAbi, SecurityAbi__factory } from 'generated';
import { DepositAbi, DepositAbi__factory } from 'generated';
import { StakingRouterAbi, StakingRouterAbi__factory } from 'generated';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BlockTag, ProviderService } from 'provider';
import { sleep } from 'utils';
import { LocatorService } from './locator/locator.service';
import {
  DEPOSIT_ABI,
  DSM_ABI,
  INIT_CONTRACTS_TIMEOUT,
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
  private tempContractsCache: Record<
    string,
    LidoAbi | LocatorAbi | SecurityAbi | StakingRouterAbi
  > = {};
  private permanentContractsCache: Record<string, DepositAbi> = {};

  /**
   * Init cache for each contract
   */
  public async initCachedContracts(blockTag: BlockTag) {
    await this.initCachedLidoContract(blockTag);
    // order is important: deposit contract depends on dsm
    await this.initCachedDSMContract(blockTag);
    await this.initCachedDepositContract(blockTag);
    await this.initCachedStakingRouterContract(blockTag);
  }

  /**
   * Init cache for each contract or wait if it makes some error
   */
  public async initOrWaitCachedContracts(): Promise<Block> {
    const block = await this.providerService.getBlock();
    try {
      await this.initCachedContracts({ blockHash: block.hash });
      return block;
    } catch (error) {
      this.logger.error('Init contracts error. Retry', error);
      await sleep(INIT_CONTRACTS_TIMEOUT);
      return await this.initOrWaitCachedContracts();
    }
  }

  /**
   * Get Lido contract impl
   */
  public getCachedLidoContract(): LidoAbi {
    return this.getFromCache(LIDO_ABI) as LidoAbi;
  }

  /**
   * Get DSM contract impl
   */
  public getCachedDSMContract(): SecurityAbi {
    return this.getFromCache(DSM_ABI) as SecurityAbi;
  }

  /**
   * Get Deposit contract impl
   */
  public getCachedDepositContract(): DepositAbi {
    return this.permanentContractsCache[DEPOSIT_ABI] as DepositAbi;
  }

  /**
   * Get SR contract impl
   */
  public getCachedStakingRouterContract(): StakingRouterAbi {
    return this.getFromCache(STAKING_ROUTER_ABI) as StakingRouterAbi;
  }

  /**
   * Get cached contract impl
   */
  private getFromCache(abiKey: string) {
    const contract = this.tempContractsCache[abiKey];
    if (contract) return contract;
    throw new Error(`Not found ABI for key: ${abiKey}`);
  }

  /**
   * Set contract cache and log on event
   */
  public setContractCache(
    address: string,
    contractKey: string,
    impl: LidoAbi | LocatorAbi | SecurityAbi | StakingRouterAbi,
  ) {
    if (!this.tempContractsCache[contractKey]) {
      this.logger.log('Contract initial address', { address, contractKey });
    }

    if (
      this.tempContractsCache[contractKey] &&
      this.tempContractsCache[contractKey].address !== address
    ) {
      this.logger.log('Contract address was changed', { address, contractKey });
    }

    this.tempContractsCache[contractKey] = impl;
  }

  private setPermanentContractCache(
    address: string,
    contractKey: string,
    impl: DepositAbi,
  ) {
    this.logger.log('Contract initial address', { address, contractKey });
    this.permanentContractsCache[contractKey] = impl;
  }

  /**
   * Init cache for Lido contract
   */
  private async initCachedLidoContract(blockTag: BlockTag): Promise<void> {
    const address = await this.locatorService.getLidoAddress(blockTag);
    const provider = this.providerService.provider;

    this.setContractCache(
      address,
      LIDO_ABI,
      LidoAbi__factory.connect(address, provider),
    );
  }

  /**
   * Init cache for DSM contract
   */
  private async initCachedDSMContract(blockTag: BlockTag): Promise<void> {
    const address = await this.locatorService.getDSMAddress(blockTag);
    const provider = this.providerService.provider;

    this.setContractCache(
      address,
      DSM_ABI,
      SecurityAbi__factory.connect(address, provider),
    );
  }

  /**
   * Init cache for Deposit contract
   */
  private async initCachedDepositContract(blockTag: BlockTag): Promise<void> {
    if (this.permanentContractsCache[DEPOSIT_ABI]) return;
    const depositAddress = await this.getDepositAddress(blockTag);
    const provider = this.providerService.provider;

    this.setPermanentContractCache(
      depositAddress,
      DEPOSIT_ABI,
      DepositAbi__factory.connect(depositAddress, provider),
    );
  }

  /**
   * Init cache for SR contract
   */
  private async initCachedStakingRouterContract(
    blockTag: BlockTag,
  ): Promise<void> {
    const stakingRouterAddress =
      await this.locatorService.getStakingRouterAddress(blockTag);
    const provider = this.providerService.provider;

    this.setContractCache(
      stakingRouterAddress,
      STAKING_ROUTER_ABI,
      StakingRouterAbi__factory.connect(stakingRouterAddress, provider),
    );
  }

  /**
   * Returns Deposit contract address
   */
  public async getDepositAddress(blockTag: BlockTag): Promise<string> {
    const contract = await this.getCachedDSMContract();

    return contract.DEPOSIT_CONTRACT({ blockTag: blockTag as any });
  }
}
