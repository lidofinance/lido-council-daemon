import { Contract } from '@ethersproject/contracts';
import { Block } from '@ethersproject/providers';
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
import { ProviderService } from 'provider';

import { EVENTS_OVERLAP_BLOCKS, getLidoAddress } from './repository.constants';

@Injectable()
export class RepositoryService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @Inject(CACHE_MANAGER) private cacheManager: CacheManager,

    private providerService: ProviderService,
  ) {}

  cachedAddresses = new Map<string, { block: number; address: string }>();

  /**
   * Monitors up-to-date contract addresses
   * @returns boolean - true if contracts has been updated
   */
  public async updateContracts(block: Block): Promise<boolean> {
    const addresses = async (
      contractGetter: (block: Block) => Promise<Contract>,
      addressGetter: (block: Block) => Promise<string>,
    ) => {
      const contract = await contractGetter.bind(this, block)();
      const newAddress = await addressGetter.bind(this, block)();

      return {
        prevAddress: contract.address,
        nextAddress: newAddress,
      };
    };

    const compareResults = await Promise.all([
      /**
       * TODO: support on-fly updating for other contracts
       * needs to clear deposit and registry caches and update batch contracts in registry service
       */

      // addresses(this.getCachedKernelContract, this.getKernelAddress),
      // addresses(this.getCachedACLContract, this.getACLAddress),
      // addresses(this.getCachedRegistryContract, this.getRegistryAddress),
      // addresses(this.getCachedDepositContract, this.getDepositAddress),
      addresses(this.getCachedSecurityContract, this.getDepositSecurityAddress),
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
  public async getCachedKernelContract(block?: Block): Promise<KernelAbi> {
    const kernelAddress = await this.getKernelAddress(block);
    const provider = this.providerService.provider;

    return KernelAbi__factory.connect(kernelAddress, provider);
  }

  /**
   * Returns an instance of the ACL contract
   */
  @Cache()
  public async getCachedACLContract(block?: Block): Promise<AclAbi> {
    const aclAddress = await this.getACLAddress(block);
    const provider = this.providerService.provider;

    return AclAbi__factory.connect(aclAddress, provider);
  }

  /**
   * Returns an instance of the Deposit Security contract
   */
  @Cache()
  public async getCachedSecurityContract(block?: Block): Promise<SecurityAbi> {
    const securityAddress = await this.getDepositSecurityAddress(block);
    const provider = this.providerService.provider;

    return SecurityAbi__factory.connect(securityAddress, provider);
  }

  /**
   * Returns an instance of the Node Operators Registry contract
   */
  @Cache()
  public async getCachedRegistryContract(block?: Block): Promise<RegistryAbi> {
    const aclAddress = await this.getRegistryAddress(block);
    const provider = this.providerService.provider;

    return RegistryAbi__factory.connect(aclAddress, provider);
  }

  /**
   * Returns an instance of the Deposit contract
   */
  @Cache()
  public async getCachedDepositContract(block?: Block): Promise<DepositAbi> {
    const depositAddress = await this.getDepositAddress(block);
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
  public async getKernelAddress(block?: Block): Promise<string> {
    const blockTag = block ? { blockHash: block.hash } : undefined;
    const lidoContract = await this.getCachedLidoContract();
    return await lidoContract.kernel({ blockTag: blockTag as any });
  }

  /**
   * Returns ACL contract address
   */
  public async getACLAddress(block?: Block): Promise<string> {
    const blockTag = block ? { blockHash: block.hash } : undefined;
    const kernelContract = await this.getCachedKernelContract(block);
    return await kernelContract.acl({ blockTag: blockTag as any });
  }

  /**
   * Returns Deposit Security contract address
   */
  public async getDepositSecurityAddress(block?: Block): Promise<string> {
    block = block ?? (await this.providerService.getBlock());

    const blockTag = block ? { blockHash: block.hash } : undefined;
    const cached = this.cachedAddresses.get('depositSecurity');

    const lidoContract = await this.getCachedLidoContract();
    const aclContract = await this.getCachedACLContract(block);
    const depositRole = await lidoContract.DEPOSIT_ROLE({
      blockTag: blockTag as any,
    });

    const depositRoleFilter = aclContract.filters.SetPermission(
      null,
      lidoContract.address,
      depositRole,
    );

    const startBlock = cached?.block ? cached.block - EVENTS_OVERLAP_BLOCKS : 0;
    const endBlock = block.number;

    const result = await this.providerService.fetchEventsFallOver(
      startBlock,
      endBlock,
      async (startBlock, endBlock) => {
        const events = await aclContract.queryFilter(
          depositRoleFilter,
          startBlock,
          endBlock,
        );
        return { events, startBlock, endBlock };
      },
    );

    const lastEvent = result.events
      .filter((log) => log.args.allowed === true)
      .sort((a, b) => b.blockNumber - a.blockNumber)[0];

    const address = lastEvent?.args.entity || cached?.address;

    if (!address) {
      throw new Error('Deposit security contract address cannot be fetched');
    }

    this.cachedAddresses.set('depositSecurity', { address, block: endBlock });
    return address;
  }

  /**
   * Returns Node Operators Registry contract address
   */
  public async getRegistryAddress(block?: Block): Promise<string> {
    const blockTag = block ? { blockHash: block.hash } : undefined;
    const lidoContract = await this.getCachedLidoContract();
    return await lidoContract.getOperators({ blockTag: blockTag as any });
  }

  /**
   * Returns Deposit contract address
   */
  public async getDepositAddress(block?: Block): Promise<string> {
    const blockTag = block ? { blockHash: block.hash } : undefined;
    const lidoContract = await this.getCachedLidoContract();
    return await lidoContract.getDepositContract({ blockTag: blockTag as any });
  }
}
