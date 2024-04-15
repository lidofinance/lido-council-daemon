import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { RepositoryService } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BlockTag } from 'provider';
import { VerifiedDepositEventsCache } from './';
import { DepositTree } from './deposit-tree';
import { parseLittleEndian64 } from './deposit.utils';
import { VerifiedDepositEvent } from './interfaces';

@Injectable()
export class DepositIntegrityCheckerService {
  finalizedTree = new DepositTree();
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private repositoryService: RepositoryService,
  ) {}

  public async initialize(initialEventsCache: VerifiedDepositEventsCache) {
    await this.putEventsToTree(this.finalizedTree, initialEventsCache.data);
  }

  public async checkIntegrity(eventsCache: VerifiedDepositEventsCache) {
    const blockTag = eventsCache.headers.endBlock;

    await this.checkDepositCount(eventsCache);
    // await this.checkDepositRoot(eventsCache);

    this.logger.log('Integrity check successfully completed', { blockTag });
  }

  public async getLocalDepositRoot(eventsCache: VerifiedDepositEventsCache) {
    const tree = new DepositTree();

    console.time('from tree');

    for (const [index, event] of eventsCache.data.entries()) {
      tree.insertNode(event.depositEventHash);

      if (index % 200_000 === 0) {
        await new Promise((res) => setTimeout(res, 1));

        this.logger.log('Checking integrity of saved deposit events', {
          processed: index,
          remaining: eventsCache.data.length - index,
        });
      }
    }

    console.timeEnd('from tree');
    // 27 sec
    const localRoot = tree.getRoot();

    return localRoot;
  }

  public async putFinalizedEvents(eventsCache: VerifiedDepositEvent[]) {
    await this.putEventsToTree(this.finalizedTree, eventsCache);
    return this.finalizedTree;
  }

  public async putLatestEvents(eventsCache: VerifiedDepositEvent[]) {
    const clone = this.finalizedTree.clone();
    await this.putEventsToTree(clone, eventsCache);
    return clone;
  }

  public async checkLatestRoot(
    blockNumber: number,
    eventsCache: VerifiedDepositEvent[],
  ) {
    const tree = await this.putLatestEvents(
      eventsCache.sort((a, b) => a.depositCount - b.depositCount),
    );

    return this.checkRoot(blockNumber, tree);
  }

  public async checkFinalizedRoot(blockNumber: number) {
    return this.checkRoot(blockNumber, this.finalizedTree);
  }

  private async checkRoot(blockNumber: number, tree: DepositTree) {
    const localRoot = tree.getRoot();
    const remoteRoot = await this.getDepositRoot(blockNumber);

    if (localRoot === remoteRoot) {
      this.logger.log('Integrity check successfully completed', {
        blockNumber,
      });
      return;
    }

    this.logger.error(
      'Deposit root is different from deposit root from the network',
      { localRoot, remoteRoot },
    );

    throw new Error(
      'Deposit root is different from deposit root from the network',
    );
  }

  public async putEventsToTree(
    tree: DepositTree,
    eventsCache: VerifiedDepositEvent[],
  ) {
    console.time('from tree');

    for (const [index, event] of eventsCache.entries()) {
      tree.insertNode(event.depositEventHash);

      if (index % 200_000 === 0) {
        await new Promise((res) => setTimeout(res, 1));

        this.logger.log('Checking integrity of saved deposit events', {
          processed: index,
          remaining: eventsCache.length - index,
        });
      }
    }

    console.timeEnd('from tree');
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
    console.log(localDepositCount, remoteDepositCount);
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
