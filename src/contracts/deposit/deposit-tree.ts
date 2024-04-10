import { ethers } from 'ethers';

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
  branch: string[] = [];
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

  private formBranch(node: string, depositCount: number) {
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
      node = ethers.utils.soliditySha256(
        ['bytes32', 'bytes32'],
        [this.branch[height], node],
      );
      // node = sha256(abi.encodePacked(branch[height], node));
      size /= 2;
    }
  }

  public insert(nodeData: NodeData) {
    const node = this.fromDepositNode(nodeData);
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

  public fromDepositNode(nodeData: NodeData): string {
    const { pubkey, wc, signature, amount } = nodeData;
    // bytes32 pubkey_root = sha256(abi.encodePacked(pubkey, bytes16(0)));
    const pubkeyPadded = pubkey + '0'.repeat(32); // Добавляем 16 нулевых байт к pubkey
    // sha256(abi.encodePacked(signature[:64])),

    const pubkeyRoot = ethers.utils.soliditySha256(['bytes'], [pubkeyPadded]);
    // console.log(pubkeyRoot, 'pubkeyRoot');

    const signaturePart1Root = ethers.utils.sha256(
      ethers.utils.solidityPack(
        ['bytes'],
        [ethers.utils.arrayify(signature).slice(0, 64)],
      ),
    );

    const signaturePart2Array = ethers.utils.arrayify(signature).slice(64);

    // Создаем массив из 32 нулевых байтов
    const zeroBytes = new Uint8Array(32).fill(0);

    // Конкатенируем два массива
    const signaturePart2PaddedArray = new Uint8Array([
      ...signaturePart2Array,
      ...zeroBytes,
    ]);

    const signaturePart2Root = ethers.utils.soliditySha256(
      ['bytes'],
      [signaturePart2PaddedArray],
    );
    // bytes32 signature_root = sha256(abi.encodePacked(
    //     sha256(abi.encodePacked(signature[:64])),
    //     sha256(abi.encodePacked(signature[64:], bytes32(0)))
    // ));
    const signatureRoot = ethers.utils.soliditySha256(
      ['bytes', 'bytes'],
      [signaturePart1Root, signaturePart2Root],
    );
    //  sha256(abi.encodePacked(pubkey_root, withdrawal_credentials)),
    const node1 = ethers.utils.soliditySha256(
      ['bytes', 'bytes'],
      [pubkeyRoot, wc],
    );
    // sha256(abi.encodePacked(amount, bytes24(0), signature_root))
    const node2 = ethers.utils.soliditySha256(
      ['bytes', 'bytes24', 'bytes'],
      [amount, '0x' + '0'.repeat(48), signatureRoot],
    );
    // bytes32 node = sha256(abi.encodePacked(
    //     sha256(abi.encodePacked(pubkey_root, withdrawal_credentials)),
    //     sha256(abi.encodePacked(amount, bytes24(0), signature_root))
    // ));
    const node = ethers.utils.soliditySha256(
      ['bytes', 'bytes'],
      [node1, node2],
    );
    return node;
  }

  private toLittleEndian64(value: number): string {
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return '0x' + buffer.toString('hex');
  }
}
