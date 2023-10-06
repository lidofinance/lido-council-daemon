import { CHAINS } from '@lido-sdk/constants';
import { ByteVectorType, UintNumberType } from '@chainsafe/ssz';

export const Bytes4 = new ByteVectorType(4);
export const Bytes48 = new ByteVectorType(48);
export const Bytes32 = new ByteVectorType(32);
export const Bytes96 = new ByteVectorType(96);

export const UintNum64 = new UintNumberType(8);

export const Root = Bytes32;
export const BLSPubkey = Bytes48;
export const BLSSignature = Bytes96;
export const Version = Bytes4;
export const Domain = Bytes32;

export const DOMAIN_DEPOSIT = Uint8Array.from([3, 0, 0, 0]);
export const GENESIS_FORK_VERSION_MAINNET = Version.fromJson('0x00000000');
export const GENESIS_FORK_VERSION_PRATER = Version.fromJson('0x00001020');
export const GENESIS_FORK_VERSION_HOLESKY = Version.fromJson('0x01017000');
export const ZERO_HASH = Buffer.alloc(32, 0);

export const GENESIS_FORK_VERSION_BY_CHAIN_ID = {
  [CHAINS.Mainnet]: GENESIS_FORK_VERSION_MAINNET,
  [CHAINS.Goerli]: GENESIS_FORK_VERSION_PRATER,
  [CHAINS.Holesky]: GENESIS_FORK_VERSION_HOLESKY,
};
