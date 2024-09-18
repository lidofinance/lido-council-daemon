import {
  DepositData,
  digest2Bytes32,
  fromHexString,
  parseLittleEndian64,
  toLittleEndian64BigInt,
} from '../../../crypto';
import { ethers } from 'ethers';
import { NodeData } from '../../../interfaces';

const ZERO_HASH_HEX =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
const ZERO_HASH_ROOT_HEX = '0x000000000000000000000000000000000000000000000000';

export class DepositTree {
  static DEPOSIT_CONTRACT_TREE_DEPTH = 32;
  static ZERO_HASH = fromHexString(ZERO_HASH_HEX);
  zeroHashes: Uint8Array[] = new Array(DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH);
  branch: Uint8Array[] = [];
  nodeCount = 0n;

  constructor() {
    this.formZeroHashes();
  }

  /**
   * Initializes the zero hashes used in the tree.
   */
  private formZeroHashes() {
    this.zeroHashes[0] = DepositTree.ZERO_HASH;
    for (
      let height = 0;
      height < DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH - 1;
      height++
    ) {
      this.zeroHashes[height + 1] = digest2Bytes32(
        this.zeroHashes[height],
        this.zeroHashes[height],
      );
    }
  }

  /**
   * Forms the branch of the tree needed to update the root when a new node is inserted.
   * @param {Uint8Array} node - The node's data to be inserted.
   * @param {bigint} depositCount - The sequential index of the deposit, representing the total deposits.
   * @returns {Uint8Array[] | undefined} The updated branch of the tree after inserting the node.
   */
  private formBranch(
    node: Uint8Array,
    depositCount: bigint,
  ): Uint8Array[] | undefined {
    let size = depositCount;
    for (
      let height = 0;
      height < DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH;
      height++
    ) {
      if (size % 2n === 1n) {
        this.branch[height] = node;
        return this.branch;
      }

      node = digest2Bytes32(this.branch[height], node);

      size /= 2n;
    }
  }

  /**
   * Inserts a new node into the tree using an already computed hash. The insertion only proceeds
   * if the deposit count provided is the next sequential number expected (one more than the current node count).
   * @param {Uint8Array} node - The hash of the node to be inserted, represented as a Uint8Array.
   * @param {bigint} depositCount - The sequential count of the deposit event from the blockchain,
   *                                expected to be one more than the current highest node count.
   * @returns {boolean} Returns true if the node was successfully inserted, false otherwise.
   */
  public insert(node: Uint8Array, depositCount: bigint): boolean {
    if (depositCount !== this.nodeCount) {
      return false;
    }
    this.nodeCount++;
    this.formBranch(node, this.nodeCount);
    return true;
  }

  /**
   * Computes and returns the root hash of the deposit tree.
   * @returns {string} The computed root hash of the tree.
   */
  public getRoot() {
    let node = DepositTree.ZERO_HASH;
    let size = this.nodeCount;
    for (
      let height = 0;
      height < DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH;
      height++
    ) {
      if (size % 2n === 1n) {
        node = digest2Bytes32(this.branch[height], node);
      } else {
        node = digest2Bytes32(node, this.zeroHashes[height]);
      }
      size /= 2n;
    }
    const finalRoot = ethers.utils.soliditySha256(
      ['bytes', 'bytes', 'bytes'],
      [node, toLittleEndian64BigInt(this.nodeCount), ZERO_HASH_ROOT_HEX],
    );
    return finalRoot;
  }

  /**
   * Creates a clone of the current tree instance, copying the branch structure and node count.
   * @returns {DepositTree} A new DepositTree instance with the same state.
   */
  public clone() {
    const tree = new DepositTree();
    tree.branch = this.branch.map((array) => Uint8Array.from(array));
    tree.nodeCount = this.nodeCount;
    return tree;
  }

  /**
   * Forms the deposit node from the given NodeData structure.
   * @param {NodeData} nodeData - Detailed data of the deposit, including public key, withdrawal credentials, signature, and amount.
   * @returns {Uint8Array} The hashed node as a Uint8Array.
   */
  static formDepositNode(nodeData: NodeData): Uint8Array {
    return DepositData.hashTreeRoot({
      withdrawalCredentials: fromHexString(nodeData.wc),
      pubkey: fromHexString(nodeData.pubkey),
      signature: fromHexString(nodeData.signature),
      amount: parseLittleEndian64(nodeData.amount),
    });
  }
}
