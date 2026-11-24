import { utils, Signature, ContractTransaction, constants } from 'ethers';
import {
  DelegationContractAbi,
  SecurityAbi,
  SecurityV5Abi__factory,
} from 'generated';
import type { MessagesNames } from 'contracts/data-bus/data-bus.serializer';
import type {
  SignDepositDataParams,
  SignPauseDataParams,
  SignUnvetDataParams,
} from 'wallet/wallet.interfaces';
import { DSM_CONTRACT_VERSION_5 } from './security.constants';

/**
 * Everything that differs between DSM versions lives here, and only here:
 * the digest the guardian signs, the signature layout published on the message
 * bus, the data-bus event that carries it, which wallet signs, and how a direct
 * pause/unvet transaction reaches the DSM. Every other module asks the strategy
 * instead of branching on the version itself.
 *
 * The guardian is an EDF DelegationContract. Digests bind the guardian
 * address, the DSM takes `GuardianSignature { guardian, bytes signature }` and
 * forwards the blob to the guardian's ERC-1271 check byte for byte. That
 * contract is on OpenZeppelin 5.x, whose `ECDSA` accepts the 65-byte
 * `r || s || v` layout only — so the bus publishes that blob, and a relayer
 * forwards what it reads. Direct calls go through the DelegationContract's
 * `execute()`: the DSM authorizes `msg.sender` and ignores the signature
 * argument, so an empty one is sent.
 */

/** The compact pair on v4, the 65-byte blob on v5. */
export type WireSignature = { r: string; vs: string } | string;

export interface DsmTxDeps {
  /** The cached DSM contract connected to the active wallet. */
  dsm: SecurityAbi;
  /** The guardian DelegationContract connected to the delegate wallet. */
  delegation: () => DelegationContractAbi;
  dsmAddress: string;
}

export interface UnvetTxParams {
  nonce: number;
  blockNumber: number;
  blockHash: string;
  stakingModuleId: number;
  operatorIds: string;
  vettedKeysByOperator: string;
}

export interface DsmVersionStrategy {
  /** Which configured wallet signs digests and sends transactions. */
  signer: 'legacy' | 'delegate';
  /** The digest signed for `depositBufferedEther` attestation. */
  depositDigest(params: SignDepositDataParams): string;
  /** The digest signed for `pauseDeposits`. */
  pauseDigest(params: SignPauseDataParams): string;
  /** The digest signed for `unvetSigningKeys`. */
  unvetDigest(params: SignUnvetDataParams): string;
  /** The signature layout published on the message bus. */
  wireSignature(signature: Signature): WireSignature;
  /** The data-bus event that carries each message type. */
  busEvents: Record<'deposit' | 'pause' | 'unvet', MessagesNames>;
  /** A direct `pauseDeposits` transaction. */
  sendPause(
    deps: DsmTxDeps,
    blockNumber: number,
    signature: Signature,
  ): Promise<ContractTransaction>;
  /** A direct `unvetSigningKeys` transaction. */
  sendUnvet(
    deps: DsmTxDeps,
    params: UnvetTxParams,
    signature: Signature,
  ): Promise<ContractTransaction>;
}

function requireGuardianAddress(guardianAddress?: string): string {
  if (!guardianAddress || !utils.isAddress(guardianAddress)) {
    throw new Error('A valid guardian address is required for DSM version 5');
  }
  return utils.getAddress(guardianAddress);
}

const v5Interface = SecurityV5Abi__factory.createInterface();

/** The push path authorizes `msg.sender`; the signature argument is unread. */
const EMPTY_GUARDIAN_SIGNATURE = {
  guardian: constants.AddressZero,
  signature: '0x',
};

const v5Strategy: DsmVersionStrategy = {
  signer: 'delegate',

  depositDigest({
    prefix,
    guardianAddress,
    blockNumber,
    blockHash,
    depositRoot,
    stakingModuleId,
    nonce,
  }) {
    return utils.keccak256(
      utils.solidityPack(
        [
          'bytes32',
          'address',
          'uint256',
          'bytes32',
          'bytes32',
          'uint256',
          'uint256',
        ],
        [
          prefix,
          requireGuardianAddress(guardianAddress),
          blockNumber,
          blockHash,
          depositRoot,
          stakingModuleId,
          nonce,
        ],
      ),
    );
  },

  pauseDigest({ prefix, guardianAddress, blockNumber }) {
    return utils.keccak256(
      utils.solidityPack(
        ['bytes32', 'address', 'uint256'],
        [prefix, requireGuardianAddress(guardianAddress), blockNumber],
      ),
    );
  },

  unvetDigest({
    prefix,
    guardianAddress,
    blockNumber,
    blockHash,
    stakingModuleId,
    nonce,
    operatorIds,
    vettedKeysByOperator,
  }) {
    return utils.keccak256(
      utils.solidityPack(
        [
          'bytes32',
          'address',
          'uint256',
          'bytes32',
          'uint256',
          'uint256',
          'bytes',
          'bytes',
        ],
        [
          prefix,
          requireGuardianAddress(guardianAddress),
          blockNumber,
          blockHash,
          stakingModuleId,
          nonce,
          operatorIds,
          vettedKeysByOperator,
        ],
      ),
    );
  },

  wireSignature(signature) {
    return utils.hexConcat([
      signature.r,
      signature.s,
      utils.hexlify(signature.v),
    ]);
  },

  busEvents: {
    deposit: 'MessageDepositV2',
    pause: 'MessagePauseV4',
    unvet: 'MessageUnvetV2',
  },

  async sendPause(deps, blockNumber, signature) {
    void signature;
    return deps
      .delegation()
      .execute(
        deps.dsmAddress,
        v5Interface.encodeFunctionData('pauseDeposits', [
          blockNumber,
          EMPTY_GUARDIAN_SIGNATURE,
        ]),
        { value: 0 },
      );
  },

  async sendUnvet(deps, params, signature) {
    void signature;
    return deps
      .delegation()
      .execute(
        deps.dsmAddress,
        v5Interface.encodeFunctionData('unvetSigningKeys', [
          params.blockNumber,
          params.blockHash,
          params.stakingModuleId,
          params.nonce,
          params.operatorIds,
          params.vettedKeysByOperator,
          EMPTY_GUARDIAN_SIGNATURE,
        ]),
        { value: 0 },
      );
  },
};

/**
 * The single version switch. Everything else asks the returned strategy.
 * Ping messages carry no DSM version. For them, it returns the v5 strategy.
 */
export function getDsmStrategy(dsmVersion?: number): DsmVersionStrategy {
  if (dsmVersion !== undefined && dsmVersion !== DSM_CONTRACT_VERSION_5) {
    throw new Error(`Unsupported DSM contract version: ${dsmVersion}`);
  }
  return v5Strategy;
}
