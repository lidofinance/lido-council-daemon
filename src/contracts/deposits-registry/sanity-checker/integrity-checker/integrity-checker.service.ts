import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { RepositoryService } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DepositTree } from './deposit-tree';
import {
  VerifiedDepositEvent,
  VerifiedDepositEventsCache,
} from '../../interfaces';
import { DEPOSIT_TREE_STEP_SYNC } from './constants';
import { toHexString } from 'contracts/deposits-registry/crypto';

@Injectable()
export class DepositIntegrityCheckerService {
  private finalizedTree = new DepositTree();
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
   * Checks the integrity of the latest deposit root against the blockchain deposit root for a given block number.
   * latest is the tag against which the state relative to the blockchain is stored
   * @param {number} blockNumber - Block number to check the deposit root against.
   * @param {VerifiedDepositEvent[]} eventsCache - Latest events to verify against the deposit root.
   * @returns {Promise<void>} A promise that resolves if the roots match, otherwise throws an error.
   */
  public async checkLatestRoot(
    blockHash: string,
    eventsCache: VerifiedDepositEvent[],
  ): Promise<boolean> {
    const tree = await this.putLatestEvents(
      eventsCache.sort((a, b) => a.depositCount - b.depositCount),
    );

    return this.checkRoot(blockHash, tree);
  }

  /**
   * Checks the integrity of the finalized deposit root against the blockchain deposit root for a given block number.
   * finalized is the tag against which the state relative to the blockchain is stored.
   * @param {string | number} tag - Block Tag to check the deposit root against.
   * @returns {Promise<void>} A promise that resolves if the roots match, otherwise throws an error.
   */
  public async checkFinalizedRoot(blockHash: string): Promise<boolean> {
    return this.checkRoot(blockHash, this.finalizedTree);
  }

  /**
   * A private helper method to compare the local deposit tree root with the remote deposit root from the blockchain.
   * @param {string | number} tag - Block Tag associated with the deposit root to verify.
   * @param {DepositTree} tree - Deposit tree to use for comparison.
   * @returns {Promise<void>} A promise that resolves if the roots match, otherwise logs an error and throws.
   */
  private async checkRoot(blockHash: string, tree: DepositTree) {
    const localRoot = tree.getRoot();
    const remoteRoot = await this.getDepositRoot(blockHash);

    if (localRoot === remoteRoot) {
      this.logger.log('Integrity check successfully completed', {
        blockHash,
      });
      return true;
    }

    this.logger.error(
      'Deposit root is different from deposit root from the network',
      { localRoot, remoteRoot },
    );

    return false;
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
      const insertionIsMade = tree.insert(
        event.depositDataRoot,
        BigInt(event.depositCount),
      );

      if (!insertionIsMade) {
        const {
          depositCount,
          depositDataRoot,
          index: eventIndex,
          blockHash,
          blockNumber,
        } = event;

        this.logger.warn(
          'Problem found while forming deposit tree with event',
          {
            depositCount,
            depositDataRoot: toHexString(depositDataRoot),
            blockHash,
            blockNumber,
            eventIndex,
            depositCountInTree: Number(tree.nodeCount),
          },
        );

        throw new Error('Problem found while forming deposit tree with event');
      }

      if (index % DEPOSIT_TREE_STEP_SYNC === 0) {
        await new Promise((res) => setTimeout(res, 1));

        this.logger.log('Inserting verified deposit events', {
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
  public async getDepositRoot(blockHash: string): Promise<string> {
    const contract = await this.repositoryService.getCachedDepositContract();
    const overrides = { blockTag: { blockHash } };
    const depositRoot = await contract.get_deposit_root(overrides as any);

    return depositRoot;
  }
}
