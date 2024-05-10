import { DepositTree } from './deposit-tree';

describe('DepositTree', () => {
  let depositTree;

  beforeEach(() => {
    depositTree = new DepositTree();
  });

  test('should correctly initialize', () => {
    expect(depositTree.nodeCount).toBe(0);
    expect(depositTree.branch.length).toBe(0);
    expect(depositTree.zeroHashes[0]).toEqual(DepositTree.ZERO_HASH);
  });

  test('insert should correctly modify the tree', () => {
    const nodeData = {
      pubkey: '0xaabbccdd',
      wc: '0x11223344',
      amount: '0x0000000000000001', // Little endian of 1
      signature: '0x55667788',
    };
    depositTree.insert(nodeData);
    expect(depositTree.nodeCount).toBe(1);
  });

  test('clone should create an exact copy of the tree', () => {
    const nodeData = {
      pubkey: '0xaabbccdd',
      wc: '0x11223344',
      amount: '0x0000000000000001',
      signature: '0x55667788',
    };
    depositTree.insert(nodeData);
    const clonedTree = depositTree.clone();
    expect(clonedTree).toEqual(depositTree);
    expect(clonedTree.getRoot()).toEqual(depositTree.getRoot());
  });
});
