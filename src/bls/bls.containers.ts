import { ContainerType } from '@chainsafe/ssz';
import {
  BLSPubkey,
  Bytes32,
  Root,
  UintNum64,
  Version,
  Domain,
  BLSSignature,
} from './bls.constants';

export const DepositMessage = new ContainerType(
  { pubkey: BLSPubkey, withdrawalCredentials: Bytes32, amount: UintNum64 },
  { typeName: 'DepositMessage', jsonCase: 'eth2' },
);

export const DepositData = new ContainerType(
  {
    pubkey: BLSPubkey,
    withdrawalCredentials: Bytes32,
    amount: UintNum64,
    signature: BLSSignature,
  },
  { typeName: 'DepositData', jsonCase: 'eth2' },
);

export const ForkData = new ContainerType(
  { currentVersion: Version, genesisValidatorsRoot: Root },
  { typeName: 'ForkData', jsonCase: 'eth2' },
);

export const SigningData = new ContainerType(
  { objectRoot: Root, domain: Domain },
  { typeName: 'SigningData', jsonCase: 'eth2' },
);
