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

  /**
   * Initializes the deposit tree with an initial cache of verified deposit events.
   * @param {VerifiedDepositEventsCache} initialEventsCache - Cache of verified deposit events to initialize the tree.
   */
  public async initialize(initialEventsCache: VerifiedDepositEventsCache) {
    await this.putEventsToTree(this.finalizedTree, initialEventsCache.data);
  }

  /**
   * Inserts a list of finalized verified deposit events into the deposit tree and returns the updated tree.
   * @param {VerifiedDepositEvent[]} eventsCache - Array of verified deposit events to be added to the tree.
   * @returns {Promise<DepositTree>} The updated deposit tree after adding the events.
   */
  public async putFinalizedEvents(
    eventsCache: VerifiedDepositEvent[],
  ): Promise<DepositTree> {
    await this.putEventsToTree(this.finalizedTree, eventsCache);
    return this.finalizedTree;
  }

  /**
   * Inserts a list of latest verified deposit events into a clone of the deposit tree and returns the cloned tree.
   * @param {VerifiedDepositEvent[]} eventsCache - Array of verified deposit events to be added to the cloned tree.
   * @returns {Promise<DepositTree>} The cloned and updated deposit tree after adding the events.
   */
  public async putLatestEvents(
    eventsCache: VerifiedDepositEvent[],
  ): Promise<DepositTree> {
    const clone = this.finalizedTree.clone();
    await this.putEventsToTree(clone, eventsCache);
    return clone;
  }

  /**
   * Checks the integrity of the latest root against the blockchain deposit root for a given block number.
   * @param {number} blockNumber - Block number to check the deposit root against.
   * @param {VerifiedDepositEvent[]} eventsCache - Latest events to verify against the deposit root.
   * @returns {Promise<void>} A promise that resolves if the roots match, otherwise throws an error.
   */
  public async checkLatestRoot(
    blockNumber: number,
    eventsCache: VerifiedDepositEvent[],
  ): Promise<void> {
    const tree = await this.putLatestEvents(
      eventsCache.sort((a, b) => a.depositCount - b.depositCount),
    );

    return this.checkRoot(blockNumber, tree);
  }

  /**
   * Checks the integrity of the finalized root against the blockchain deposit root for a given block number.
   * @param {number} blockNumber - Block number to check the deposit root against.
   * @returns {Promise<void>} A promise that resolves if the roots match, otherwise throws an error.
   */
  public async checkFinalizedRoot(blockNumber: number): Promise<void> {
    return this.checkRoot(blockNumber, this.finalizedTree);
  }

  /**
   * A private helper method to compare the local deposit tree root with the remote deposit root from the blockchain.
   * @param {number} blockNumber - Block number associated with the deposit root to verify.
   * @param {DepositTree} tree - Deposit tree to use for comparison.
   * @returns {Promise<void>} A promise that resolves if the roots match, otherwise logs an error and throws.
   */
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

  /**
   * Inserts verified deposit events into the provided deposit tree and logs progress periodically.
   * @param {DepositTree} tree - Deposit tree to insert events into.
   * @param {VerifiedDepositEvent[]} eventsCache - Events to insert into the tree.
   */
  public async putEventsToTree(
    tree: DepositTree,
    eventsCache: VerifiedDepositEvent[],
  ) {
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
   * Retrieves the deposit root from the blockchain for a specific block.
   * @param {BlockTag | undefined} blockTag - Specific block number or tag to retrieve the deposit root for.
   * @returns {Promise<string>} Promise that resolves with the deposit root.
   */
  public async getDepositRoot(blockTag?: BlockTag): Promise<string> {
    const contract = await this.repositoryService.getCachedDepositContract();
    const depositRoot = await contract.get_deposit_root({
      blockTag: blockTag as any,
    });

    return depositRoot;
  }
}