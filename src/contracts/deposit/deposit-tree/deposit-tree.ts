import { ethers } from 'ethers';
import { digest2Bytes32 } from '@chainsafe/as-sha256';
import { fromHexString } from '@chainsafe/ssz';
import { parseLittleEndian64, toLittleEndian64 } from '../deposit.utils';
import { DepositData } from 'bls/bls.containers';
import { NodeData } from '../interfaces';

export class DepositTree {
  static DEPOSIT_CONTRACT_TREE_DEPTH = 32;
  static ZERO_HASH = fromHexString(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
  );
  zeroHashes: Uint8Array[] = new Array(DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH);
  branch: Uint8Array[] = [];
  nodeCount = 0;

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
   * @param {number} depositCount - The sequential index of the deposit, representing the total deposits.
   * @returns {Uint8Array[] | undefined} The updated branch of the tree after inserting the node.
   */
  private formBranch(
    node: Uint8Array,
    depositCount: number,
  ): Uint8Array[] | undefined {
    let size = depositCount;
    for (
      let height = 0;
      height < DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH;
      height++
    ) {
      if ((size & 1) == 1) {
        this.branch[height] = node;
        return this.branch;
      }

      node = digest2Bytes32(this.branch[height], node);

      size /= 2;
    }
  }

  /**
   * Inserts a new deposit into the tree using detailed node data.
   * @param {NodeData} nodeData - The detailed data of the deposit to be inserted.
   */
  public insert(nodeData: NodeData) {
    const node = DepositTree.formDepositNode(nodeData);
    this.nodeCount++;
    this.formBranch(node, this.nodeCount);
  }

  /**
   * Inserts a new node into the tree using already computed node hash.
   * @param {Uint8Array} node - The node's hash to be inserted.
   */
  public insertNode(node: Uint8Array) {
    this.nodeCount++;
    this.formBranch(node, this.nodeCount);
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
      if ((size & 1) == 1) {
        node = digest2Bytes32(this.branch[height], node);
      } else {
        node = digest2Bytes32(node, this.zeroHashes[height]);
      }
      size /= 2;
    }
    const finalRoot = ethers.utils.soliditySha256(
      ['bytes', 'bytes', 'bytes'],
      [
        node,
        toLittleEndian64(this.nodeCount),
        '0x000000000000000000000000000000000000000000000000',
      ],
    );
    return finalRoot;
  }

  /**
   * Creates a clone of the current tree instance, copying the branch structure and node count.
   * @returns {DepositTree} A new DepositTree instance with the same state.
   */
  public clone() {
    const tree = new DepositTree();
    tree.branch = [...this.branch];
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
