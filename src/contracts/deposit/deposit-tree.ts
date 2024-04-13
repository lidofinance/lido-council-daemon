import { ethers } from 'ethers';
import { digest2Bytes32 } from '@chainsafe/as-sha256';
import { fromHexString } from '@chainsafe/ssz';
import { parseLittleEndian64 } from './deposit.utils';
import { DepositData } from 'bls/bls.containers';

type NodeData = {
  pubkey: string;
  wc: string;
  amount: string;
  signature: string;
};
export class DepositTree {
  static DEPOSIT_CONTRACT_TREE_DEPTH = 32;
  static ZERO_HASH =
    '0x0000000000000000000000000000000000000000000000000000000000000000';
  zeroHashes: string[] = new Array(DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH);
  branch: Uint8Array[] = [];
  nodeCount = 0;

  constructor() {
    this.formZeroHashes();
  }

  private formZeroHashes() {
    this.zeroHashes[0] = DepositTree.ZERO_HASH;
    for (
      let height = 0;
      height < DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH - 1;
      height++
    ) {
      const hash = ethers.utils.sha256(
        ethers.utils.concat([
          ethers.utils.arrayify(this.zeroHashes[height]),
          ethers.utils.arrayify(this.zeroHashes[height]),
        ]),
      );
      this.zeroHashes[height + 1] = ethers.utils.hexlify(hash);
    }
  }

  private formBranch(node: Uint8Array, depositCount: number) {
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

  public insert(nodeData: NodeData) {
    const node = DepositTree.formDepositNode(nodeData);
    this.nodeCount++;
    this.formBranch(node, this.nodeCount);
  }

  public insertNode(node: Uint8Array) {
    this.nodeCount++;
    this.formBranch(node, this.nodeCount);
  }

  public getRoot() {
    let node = DepositTree.ZERO_HASH;
    let size = this.nodeCount;
    for (
      let height = 0;
      height < DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH;
      height++
    ) {
      if ((size & 1) == 1) {
        node = ethers.utils.soliditySha256(
          ['bytes32', 'bytes32'],
          [this.branch[height], node],
        );
        // node = sha256(abi.encodePacked(branch[height], node));
      } else {
        node = ethers.utils.soliditySha256(
          ['bytes32', 'bytes32'],
          [node, this.zeroHashes[height]],
        );
        // node = sha256(abi.encodePacked(node, this.zeroHashes[height]));
      }
      // TODO: check max number js
      size /= 2;
    }
    const finalRoot = ethers.utils.soliditySha256(
      ['bytes', 'bytes', 'bytes'],
      [
        node,
        this.toLittleEndian64(this.nodeCount),
        '0x000000000000000000000000000000000000000000000000',
      ],
    );

    return finalRoot;
  }

  static formDepositNode(nodeData: NodeData): Uint8Array {
    return DepositData.hashTreeRoot({
      withdrawalCredentials: fromHexString(nodeData.wc),
      pubkey: fromHexString(nodeData.pubkey),
      signature: fromHexString(nodeData.signature),
      amount: parseLittleEndian64(nodeData.amount),
    });
  }

  private toLittleEndian64(value: number): string {
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return '0x' + buffer.toString('hex');
  }
}
