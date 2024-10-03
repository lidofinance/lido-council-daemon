import { digest2Bytes32, fromHexString, toHexString } from '../../../crypto';
import { DepositTree } from './deposit-tree';
import {
  depositDataRootsFixture20k,
  depositDataRootsFixture10k,
  dataTransformFixtures,
} from './deposit-tree.fixture';
const MOCK_DEPOSIT_COUNT = 0n;
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
    depositTree.insert(node, MOCK_DEPOSIT_COUNT);
    expect(depositTree.nodeCount).toBe(initialNodeCount + 1n);
  });

  test('should detect problem with deposit count while inserting new node', () => {
    const initialNodeCount = depositTree.nodeCount;
    const node = new Uint8Array(32).fill(1);
    const SOME_UNREAL_DEPOSIT_COUNT = 100n;
    const isInserted = depositTree.insert(node, SOME_UNREAL_DEPOSIT_COUNT);
    expect(depositTree.nodeCount).toBe(initialNodeCount);
    expect(isInserted).toBeFalsy();
  });

  test('should handle detailed node data correctly', () => {
    const originalTree = new DepositTree();
    const nodeData = {
      wc: '0x123456789abcdef0',
      pubkey: '0xabcdef1234567890',
      signature: '0x987654321fedcba0',
      amount: '0x0100000000000000',
    };
    originalTree.insert(DepositTree.formDepositNode(nodeData), 0n);
    expect(Number(originalTree.nodeCount)).toBe(1);

    const oldDepositRoot = originalTree.getRoot();
    const cloned = originalTree.clone();

    cloned.insert(
      DepositTree.formDepositNode({ ...nodeData, wc: '0x123456789abcdef1' }),
      1n,
    );

    expect(cloned.getRoot()).not.toEqual(oldDepositRoot);
    expect(cloned.getRoot()).not.toEqual(originalTree.getRoot());
    expect(originalTree.getRoot()).toEqual(oldDepositRoot);

    const freshTree = new DepositTree();

    freshTree.insert(DepositTree.formDepositNode(nodeData), 0n);
    freshTree.insert(
      DepositTree.formDepositNode({ ...nodeData, wc: '0x123456789abcdef1' }),
      1n,
    );

    expect(cloned.getRoot()).toEqual(freshTree.getRoot());
  });

  test('branches from cloned tree do not linked with original tree', () => {
    const originalTree = new DepositTree();
    const nodeData = {
      wc: '0x123456789abcdef0',
      pubkey: '0xabcdef1234567890',
      signature: '0x987654321fedcba0',
      amount: '0x0100000000000000',
    };

    originalTree.insert(
      DepositTree.formDepositNode({ ...nodeData, wc: '0x123456789abcdef1' }),
      0n,
    );
    originalTree.insert(
      DepositTree.formDepositNode({ ...nodeData, wc: '0x123456789abcdef1' }),
      1n,
    );

    originalTree.branch[0][0] = 1;
    const clone = originalTree.clone();
    originalTree.branch[0][1] = 1;

    expect(clone.branch[0][1]).toBe(142);
    expect(originalTree.branch[0][1]).toBe(1);
  });

  test('clone works correctly', () => {
    const nodeData = {
      wc: '0x123456789abcdef0',
      pubkey: '0xabcdef1234567890',
      signature: '0x987654321fedcba0',
      amount: '0x0100000000000000',
    };
    depositTree.insert(
      DepositTree.formDepositNode(nodeData),
      MOCK_DEPOSIT_COUNT,
    );
    expect(Number(depositTree.nodeCount)).toBe(1);
  });

  test('should clone the tree correctly', () => {
    depositTree.insert(new Uint8Array(32).fill(1), MOCK_DEPOSIT_COUNT);
    const clonedTree = depositTree.clone();
    expect(clonedTree.nodeCount).toEqual(depositTree.nodeCount);
    expect(clonedTree.branch).toEqual(depositTree.branch);
    expect(clonedTree).not.toBe(depositTree);
  });

  test('branch updates correctly after multiple insertions', () => {
    const node1 = new Uint8Array(32).fill(1); // First example node
    depositTree.insert(node1, MOCK_DEPOSIT_COUNT); // First insertion

    expect(depositTree.branch[0]).toEqual(node1);

    const node2 = new Uint8Array(32).fill(2); // Second example node
    depositTree.insert(node2, MOCK_DEPOSIT_COUNT + 1n); // Second insertion

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
    expect(() => DepositTree.formDepositNode(invalidNodeData)).toThrowError();
  });

  test.each(dataTransformFixtures)(
    'actual validation using data and hash from blockchain',
    (event) => {
      const depositDataRoot = DepositTree.formDepositNode({
        wc: event.wc,
        pubkey: event.pubkey,
        signature: event.signature,
        amount: event.amount,
      });

      expect(toHexString(depositDataRoot)).toEqual(event.depositDataRoot);
    },
  );

  test('hashes should matches with fixtures (first 10k blocks from holesky)', () => {
    depositDataRootsFixture10k.events.map((ev, index) =>
      depositTree.insert(fromHexString(ev), BigInt(index)),
    );

    expect(Number(depositTree.nodeCount)).toEqual(
      depositDataRootsFixture10k.events.length,
    );
    expect(depositTree.getRoot()).toEqual(depositDataRootsFixture10k.root);
  });

  test('hashes should matches with fixtures (second 10k blocks from holesky)', () => {
    depositDataRootsFixture10k.events.map((ev, index) =>
      depositTree.insert(fromHexString(ev), BigInt(index)),
    );

    expect(Number(depositTree.nodeCount)).toEqual(
      depositDataRootsFixture10k.events.length,
    );
    expect(depositTree.getRoot()).toEqual(depositDataRootsFixture10k.root);

    depositDataRootsFixture20k.events.map((ev, index) =>
      depositTree.insert(
        fromHexString(ev),
        BigInt(depositDataRootsFixture10k.events.length + index),
      ),
    );
    expect(Number(depositTree.nodeCount)).toEqual(
      depositDataRootsFixture10k.events.length +
        depositDataRootsFixture20k.events.length,
    );
    expect(depositTree.getRoot()).toEqual(depositDataRootsFixture20k.root);
  });
});
