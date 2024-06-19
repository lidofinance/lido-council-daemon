import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { LidoAbi, LidoAbi__factory, LocatorAbi } from 'generated';
import { SecurityAbi, SecurityAbi__factory } from 'generated';
import { DepositAbi, DepositAbi__factory } from 'generated';
import { CsmAbi, CsmAbi__factory } from 'generated';
import { SigningKeyAbi, SigningKeyAbi__factory } from 'generated';
import { IStakingModuleAbi__factory } from 'generated';
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
  COMMUNITY_ONCHAIN_DEVNET0_V1_TYPE,
  COMMUNITY_ONCHAIN_V1_TYPE,
  CURATED_ONCHAIN_V1_TYPE,
} from './repository.constants';
import { ethers } from 'ethers';
import { StakingModule } from './interfaces/staking-module';

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
  // store prefixes on the current state of the contracts.
  // if the contracts are updated we will change these addresses too
  private cachedDSMPrefixes: Record<string, string> = {};
  private permanentContractsCache: Record<string, DepositAbi> = {};
  private stakingModulesCache: Record<string, StakingModule> = {};

  /**
   * Init cache for each contract
   */
  public async initCachedContracts(blockTag: BlockTag) {
    await this.initCachedLidoContract(blockTag);
    // order is important: deposit contract depends on dsm
    await this.initCachedDSMContract(blockTag);
    await this.initCachedDepositContract(blockTag);
    await this.initCachedStakingRouterAbiContract(blockTag);
    await this.initCachedStakingModulesContracts(blockTag);
  }

  /**
   * Init cache for each contract or wait if it makes some error
   */
  public async initOrWaitCachedContracts() {
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
   * Get Node Operator Registry contract impl
   */
  public getCachedStakingModulesContracts(): Record<string, StakingModule> {
    return this.stakingModulesCache;
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

  public setStakingModuleCache(address: string, impl: SigningKeyAbi | CsmAbi) {
    if (!this.stakingModulesCache[address]) {
      this.logger.log('Staking module contract initial address', { address });
    }

    if (
      this.stakingModulesCache[address] &&
      this.stakingModulesCache[address].impl.address !== address
    ) {
      this.logger.log('Staking module contract address was changed', {
        address,
      });
    }

    this.stakingModulesCache[address] = { impl };
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

    // prune dsm prefixes
    this.cachedDSMPrefixes = {};

    // re-init dsm prefixes
    await Promise.all([
      this.getAttestMessagePrefix(),
      this.getPauseMessagePrefix(),
    ]);
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
  private async initCachedStakingRouterAbiContract(
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

  private async initCachedStakingModulesContracts(
    blockTag: BlockTag,
  ): Promise<void> {
    const stakingModules = await this.getStakingModules(blockTag);
    await Promise.all(
      stakingModules.map(async (stakingModule) => {
        const type = await this.getStakingModuleType(
          stakingModule.stakingModuleAddress,
          blockTag,
        );

        const provider = this.providerService.provider;

        if (type === CURATED_ONCHAIN_V1_TYPE) {
          this.setStakingModuleCache(
            stakingModule.stakingModuleAddress,
            SigningKeyAbi__factory.connect(
              stakingModule.stakingModuleAddress,
              provider,
            ),
          );
          return;
        }

        if (
          type === COMMUNITY_ONCHAIN_V1_TYPE ||
          type === COMMUNITY_ONCHAIN_DEVNET0_V1_TYPE
        ) {
          this.setStakingModuleCache(
            stakingModule.stakingModuleAddress,
            CsmAbi__factory.connect(
              stakingModule.stakingModuleAddress,
              provider,
            ),
          );
          return;
        }

        this.logger.error(new Error(`Staking Module type ${type} is unknown`));
        process.exit(1);
      }),
    );
  }

  public async getStakingModules(blockTag: BlockTag) {
    const stakingRouter = await this.getCachedStakingRouterContract();
    const stakingModules = await stakingRouter.getStakingModules({
      blockTag: blockTag as any,
    });

    return stakingModules;
  }

  public async getStakingModuleType(
    contractAddress: string,
    blockTag: BlockTag,
  ): Promise<string> {
    const contract = IStakingModuleAbi__factory.connect(
      contractAddress,
      this.providerService.provider,
    );

    const type = await contract.getType({ blockTag } as any);
    return ethers.utils.parseBytes32String(type);
  }

  /**
   * Returns a prefix from the contract with which the deposit message should be signed
   */
  public async getAttestMessagePrefix(): Promise<string> {
    if (this.cachedDSMPrefixes.attest) return this.cachedDSMPrefixes.attest;
    const contract = await this.getCachedDSMContract();
    this.cachedDSMPrefixes.attest = await contract.ATTEST_MESSAGE_PREFIX();
    return this.cachedDSMPrefixes.attest;
  }

  /**
   * Returns a prefix from the contract with which the pause message should be signed
   */
  public async getPauseMessagePrefix(): Promise<string> {
    if (this.cachedDSMPrefixes.pause) return this.cachedDSMPrefixes.pause;
    const contract = await this.getCachedDSMContract();
    this.cachedDSMPrefixes.pause = await contract.PAUSE_MESSAGE_PREFIX();

    return this.cachedDSMPrefixes.pause;
  }

  /**
   * Returns a prefix from the contract with which the pause message should be signed
   */
  public async getUnvetMessagePrefix(): Promise<string> {
    if (this.cachedDSMPrefixes.unvet) return this.cachedDSMPrefixes.unvet;
    const contract = await this.getCachedDSMContract();
    this.cachedDSMPrefixes.unvet = await contract.UNVET_MESSAGE_PREFIX();

    return this.cachedDSMPrefixes.unvet;
  }

  /**
   * Returns Deposit contract address
   */
  public async getDepositAddress(blockTag: BlockTag): Promise<string> {
    const contract = await this.getCachedDSMContract();

    return contract.DEPOSIT_CONTRACT({ blockTag: blockTag as any });
  }
}
