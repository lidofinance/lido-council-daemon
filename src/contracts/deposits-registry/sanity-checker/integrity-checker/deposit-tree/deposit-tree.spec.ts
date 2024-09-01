import {
  digest2Bytes32,
  fromHexString,
  toLittleEndian64,
} from '../../../crypto';
import { DepositTree } from './deposit-tree';
import { fixture_10k, fixture_20k } from './deposit-tree.fixture';

describe('DepositTree', () => {
  let depositTree: DepositTree;

  beforeEach(() => {
    depositTree = new DepositTree();
  });

  test('should initialize zero hashes correctly', () => {
    expect(depositTree.zeroHashes[0]).toEqual(DepositTree.ZERO_HASH);
    for (let i = 1; i < DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH; i++) {
      expect(depositTree.zeroHashes[i]).not.toEqual(undefined);
    }
  });

  test('should correctly insert a node and update the tree', () => {
    const initialNodeCount = depositTree.nodeCount;
    const node = new Uint8Array(32).fill(1); // Example node hash
    depositTree.insertNode(node);
    expect(depositTree.nodeCount).toBe(initialNodeCount + 1);
  });

  test('should handle detailed node data correctly', () => {
    console.log(toLittleEndian64(1));
    const nodeData = {
      wc: '0x123456789abcdef0', // Ensure hex strings are of even length
      pubkey: '0xabcdef1234567890',
      signature: '0x987654321fedcba0',
      amount: '0x0100000000000000', // Example amount
    };
    depositTree.insert(nodeData);
    expect(depositTree.nodeCount).toBe(1);
  });

  test('should clone the tree correctly', () => {
    depositTree.insertNode(new Uint8Array(32).fill(1));
    const clonedTree = depositTree.clone();
    expect(clonedTree.nodeCount).toEqual(depositTree.nodeCount);
    expect(clonedTree.branch).toEqual(depositTree.branch);
    expect(clonedTree).not.toBe(depositTree);
  });

  test('branch updates correctly after multiple insertions', () => {
    const node1 = new Uint8Array(32).fill(1); // First example node
    depositTree.insertNode(node1); // First insertion

    expect(depositTree.branch[0]).toEqual(node1);

    const node2 = new Uint8Array(32).fill(2); // Second example node
    depositTree.insertNode(node2); // Second insertion

    // Now, we need to check the second level of the branch
    // This should use the same hashing function as used in your actual code
    const expectedHashAfterSecondInsert = digest2Bytes32(
      depositTree.branch[0],
      node2,
    );
    expect(depositTree.branch[1]).toEqual(expectedHashAfterSecondInsert);
  });

  test('should throw error on invalid NodeData', () => {
    const invalidNodeData = {
      wc: 'xyz',
      pubkey: 'abc',
      signature: '123',
      amount: 'not a number',
    };
    expect(() => depositTree.insert(invalidNodeData)).toThrowError();
  });

  test.todo('actual validation using data and hash from blockchain');

  test('hashes should matches with fixtures (first 10k blocks from holesky)', () => {
    fixture_10k.events.map((ev) => depositTree.insertNode(fromHexString(ev)));

    expect(depositTree.nodeCount).toEqual(fixture_10k.events.length);
    expect(depositTree.getRoot()).toEqual(fixture_10k.root);
  });

  test('hashes should matches with fixtures (second 10k blocks from holesky)', () => {
    fixture_10k.events.map((ev) => depositTree.insertNode(fromHexString(ev)));

    expect(depositTree.nodeCount).toEqual(fixture_10k.events.length);
    expect(depositTree.getRoot()).toEqual(fixture_10k.root);

    fixture_20k.events.map((ev) => depositTree.insertNode(fromHexString(ev)));
    expect(depositTree.nodeCount).toEqual(
      fixture_10k.events.length + fixture_20k.events.length,
    );
    expect(depositTree.getRoot()).toEqual(fixture_20k.root);
  });
});
