import { Contract } from '@ethersproject/contracts';
import {
  CACHE_MANAGER,
  Inject,
  Injectable,
  LoggerService,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Cache as CacheManager } from 'cache-manager';
import { Cache } from 'common/decorators';
import { LidoAbi, LidoAbi__factory } from 'generated';
import { KernelAbi, KernelAbi__factory } from 'generated';
import { AclAbi, AclAbi__factory } from 'generated';
import { SecurityAbi, SecurityAbi__factory } from 'generated';
import { RegistryAbi, RegistryAbi__factory } from 'generated';
import { DepositAbi, DepositAbi__factory } from 'generated';

import { BlockTag, ProviderService } from 'provider';
import { getLidoAddress } from './repository.constants';

@Injectable()
export class RepositoryService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @Inject(CACHE_MANAGER) private cacheManager: CacheManager,

    private providerService: ProviderService,
  ) {}

  /**
   * Monitors up-to-date contract addresses
   * @returns boolean - true if contracts has been updated
   */
  public async updateContracts(blockTag: BlockTag): Promise<boolean> {
    const addresses = async (
      contractGetter: (blockTag?: BlockTag) => Promise<Contract>,
      addressGetter: (blockTag?: BlockTag) => Promise<string>,
    ) => {
      const contract = await contractGetter.bind(this, blockTag)();
      const newAddress = await addressGetter.bind(this, blockTag)();

      return {
        prevAddress: contract.address,
        nextAddress: newAddress,
      };
    };

    const compareResults = await Promise.all([
      addresses(this.getCachedKernelContract, this.getKernelAddress),
      addresses(this.getCachedACLContract, this.getACLAddress),
      addresses(this.getCachedSecurityContract, this.getDepositSecurityAddress),
      addresses(this.getCachedRegistryContract, this.getRegistryAddress),
      addresses(this.getCachedDepositContract, this.getDepositAddress),
    ]);

    const changedAddresses = compareResults.filter(
      ({ prevAddress, nextAddress }) => prevAddress !== nextAddress,
    );

    if (changedAddresses.length) {
      this.logger.warn('Contracts addresses changed', { changedAddresses });
      await this.clearContractsCache();

      return true;
    }

    this.logger.log('Contracts addresses are up to date');
    return false;
  }

  /**
   * Clears contracts cache
   */
  private async clearContractsCache(): Promise<void> {
    await this.cacheManager.reset();
    this.logger.warn('Contracts cache cleared');
  }

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
   * Returns an instance of the Kernel contract
   */
  @Cache()
  public async getCachedKernelContract(
    blockTag?: BlockTag,
  ): Promise<KernelAbi> {
    const kernelAddress = await this.getKernelAddress(blockTag);
    const provider = this.providerService.batchProvider;

    return KernelAbi__factory.connect(kernelAddress, provider);
  }

  /**
   * Returns an instance of the ACL contract
   */
  @Cache()
  public async getCachedACLContract(blockTag?: BlockTag): Promise<AclAbi> {
    const aclAddress = await this.getACLAddress(blockTag);
    const provider = this.providerService.batchProvider;

    return AclAbi__factory.connect(aclAddress, provider);
  }

  /**
   * Returns an instance of the Deposit Security contract
   */
  @Cache()
  public async getCachedSecurityContract(
    blockTag?: BlockTag,
  ): Promise<SecurityAbi> {
    const securityAddress = await this.getDepositSecurityAddress(blockTag);
    const provider = this.providerService.provider;

    return SecurityAbi__factory.connect(securityAddress, provider);
  }

  /**
   * Returns an instance of the Node Operators Registry contract
   */
  @Cache()
  public async getCachedRegistryContract(
    blockTag?: BlockTag,
  ): Promise<RegistryAbi> {
    const aclAddress = await this.getRegistryAddress(blockTag);
    const provider = this.providerService.provider;

    return RegistryAbi__factory.connect(aclAddress, provider);
  }

  /**
   * Returns an instance of the Deposit contract
   */
  @Cache()
  public async getCachedDepositContract(
    blockTag?: BlockTag,
  ): Promise<DepositAbi> {
    const depositAddress = await this.getDepositAddress(blockTag);
    const provider = this.providerService.provider;

    return DepositAbi__factory.connect(depositAddress, provider);
  }

  /**
   * Returns Lido contract address
   */
  public async getLidoAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getLidoAddress(chainId);
  }

  /**
   * Returns Kernel contract address
   */
  public async getKernelAddress(blockTag?: BlockTag): Promise<string> {
    const lidoContract = await this.getCachedLidoContract();
    return await lidoContract.kernel({ blockTag: blockTag as any });
  }

  /**
   * Returns ACL contract address
   */
  public async getACLAddress(blockTag?: BlockTag): Promise<string> {
    const kernelContract = await this.getCachedKernelContract(blockTag);
    return await kernelContract.acl({ blockTag: blockTag as any });
  }

  /**
   * Returns Deposit Security contract address
   */
  public async getDepositSecurityAddress(blockTag?: BlockTag): Promise<string> {
    const lidoContract = await this.getCachedLidoContract();
    const aclContract = await this.getCachedACLContract(blockTag);
    const depositRole = await lidoContract.DEPOSIT_ROLE({
      blockTag: blockTag as any,
    });

    const depositRoleFilter = aclContract.filters.SetPermission(
      null,
      lidoContract.address,
      depositRole,
    );
    const logs = await aclContract.queryFilter(depositRoleFilter);
    const lastLog = logs.sort((a, b) => b.blockNumber - a.blockNumber)[0];

    return lastLog.args.entity;
  }

  /**
   * Returns Node Operators Registry contract address
   */
  public async getRegistryAddress(blockTag?: BlockTag): Promise<string> {
    const lidoContract = await this.getCachedLidoContract();
    return await lidoContract.getOperators({ blockTag: blockTag as any });
  }

  /**
   * Returns Deposit contract address
   */
  public async getDepositAddress(blockTag?: BlockTag): Promise<string> {
    const lidoContract = await this.getCachedLidoContract();
    return await lidoContract.getDepositContract({ blockTag: blockTag as any });
  }
}
