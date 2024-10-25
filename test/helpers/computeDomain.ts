import { Type } from '@chainsafe/ssz';

import {
  DOMAIN_DEPOSIT,
  GENESIS_FORK_VERSION_BY_CHAIN_ID,
  ZERO_HASH,
} from '../../src/bls/bls.constants';

import {
  DepositMessage,
  ForkData,
  SigningData,
} from '../../src/bls/bls.containers';

import { testSetupProvider } from './provider';

const computeDomain = (
  domainType: Uint8Array,
  forkVersion: Uint8Array,
  genesisValidatorRoot: Uint8Array,
): Uint8Array => {
  const forkDataRoot = computeForkDataRoot(forkVersion, genesisValidatorRoot);

  const domain = new Uint8Array(32);
  domain.set(domainType, 0);
  domain.set(forkDataRoot.slice(0, 28), 4);
  return domain;
};

const computeForkDataRoot = (
  currentVersion: Uint8Array,
  genesisValidatorsRoot: Uint8Array,
): Uint8Array => {
  return ForkData.hashTreeRoot({ currentVersion, genesisValidatorsRoot });
};

const computeSigningRoot = <T>(
  type: Type<T>,
  sszObject: T,
  domain: Uint8Array,
): Uint8Array => {
  const objectRoot = type.hashTreeRoot(sszObject);
  return SigningData.hashTreeRoot({ objectRoot, domain });
};

export const computeRoot = async (depositMessage: {
  pubkey: Uint8Array;
  withdrawalCredentials: Uint8Array;
  amount: number;
}) => {
  const network = await testSetupProvider.getNetwork();
  const CHAIN_ID = network.chainId;
  const forkVersion = GENESIS_FORK_VERSION_BY_CHAIN_ID[CHAIN_ID];

  const domain = computeDomain(DOMAIN_DEPOSIT, forkVersion, ZERO_HASH);

  const signingRoot = computeSigningRoot(
    DepositMessage,
    depositMessage,
    domain,
  );

  return signingRoot;
};
