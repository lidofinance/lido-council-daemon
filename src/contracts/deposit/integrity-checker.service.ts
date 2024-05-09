import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { RepositoryService } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BlockTag } from 'provider';
import { VerifiedDepositEventsCache } from './';
import { DepositTree } from './deposit-tree';
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
      tree.insertNode(event.depositDataRoot);

      if (index % 200_000 === 0) {
        await new Promise((res) => setTimeout(res, 1));

        this.logger.log('Checking integrity of saved deposit events', {
          processed: index,
          remaining: eventsCache.length - index,
        });
      }
    }
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

  clean() {
    this.finalizedTree = new DepositTree();
  }
}
