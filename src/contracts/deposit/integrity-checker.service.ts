import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { RepositoryService } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BlockTag } from 'provider';
import { VerifiedDepositEventsCache } from './';
import { DepositTree } from './deposit-tree';
import { parseLittleEndian64 } from './deposit.utils';

@Injectable()
export class DepositIntegrityCheckerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private repositoryService: RepositoryService,
  ) {}

  public async checkIntegrity(eventsCache: VerifiedDepositEventsCache) {
    const blockTag = eventsCache.headers.endBlock;

    await this.checkDepositCount(eventsCache);
    await this.checkDepositRoot(eventsCache);

    this.logger.log('Integrity check successfully completed', { blockTag });
  }

  public async getLocalDepositRoot(eventsCache: VerifiedDepositEventsCache) {
    eventsCache.data.sort((a, b) => a.depositCount - b.depositCount);
    const tree = new DepositTree();

    for (const [index, event] of eventsCache.data.entries()) {
      tree.insert(event);

      if (index % 20_000 === 0) {
        await new Promise((res) => setTimeout(res, 1));

        this.logger.log('Checking integrity of saved deposit events', {
          processed: index,
          remaining: eventsCache.data.length - index,
        });
      }
    }

    const localRoot = tree.getRoot();

    return localRoot;
  }

  public async checkDepositRoot(eventsCache: VerifiedDepositEventsCache) {
    const blockTag = eventsCache.headers.endBlock;

    this.logger.log('Checking for deposit root compliance', { blockTag });

    const localRoot = await this.getLocalDepositRoot(eventsCache);
    const remoteRoot = await this.getDepositRoot(blockTag);

    if (localRoot === remoteRoot) return;

    this.logger.error(
      'Deposit root is different from deposit root from the network',
      { localRoot, remoteRoot },
    );

    throw new Error(
      'Deposit root is different from deposit root from the network',
    );
  }

  public async checkDepositCount(eventsCache: VerifiedDepositEventsCache) {
    const blockTag = eventsCache.headers.endBlock;

    this.logger.log('Checking for deposit count compliance', { blockTag });

    const localDepositCount = eventsCache.data.length;
    const remoteDepositCount = await this.getDepositCount(blockTag);

    if (localDepositCount === remoteDepositCount) return;

    this.logger.error(
      'The number of deposit events differs from the number of deposits in the network',
      { localDepositCount, remoteDepositCount },
    );

    throw new Error(
      'The number of deposit events differs from the number of deposits in the network',
    );
  }

  public async getDepositCount(blockTag?: BlockTag): Promise<number> {
    const contract = await this.repositoryService.getCachedDepositContract();
    const depositCount = await contract.get_deposit_count({
      blockTag: blockTag as any,
    });
    return parseLittleEndian64(depositCount);
  }

  /**
   * Returns a deposit root
   */
  public async getDepositRoot(blockTag?: BlockTag): Promise<string> {
    const contract = await this.repositoryService.getCachedDepositContract();
    const depositRoot = await contract.get_deposit_root({
      blockTag: blockTag as any,
    });

    return depositRoot;
  }
}
