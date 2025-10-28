import * as blst from '@chainsafe/blst';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Type, fromHexString } from '@chainsafe/ssz';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import {
  Inject,
  Injectable,
  OnModuleInit,
  LoggerService,
} from '@nestjs/common';
import {
  BLSPubkey,
  Bytes32,
  DOMAIN_DEPOSIT,
  GENESIS_FORK_VERSION_BY_CHAIN_ID,
  UintNum64,
  ZERO_HASH,
} from './bls.constants';
import { DepositMessage, ForkData, SigningData } from './bls.containers';
import { DepositData } from './interfaces';

@Injectable()
export class BlsService implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private provider: SimpleFallbackJsonRpcBatchProvider,
  ) {}

  async onModuleInit() {
    const network = await this.provider.getNetwork();
    const chainId = network.chainId;
    this.forkVersion = GENESIS_FORK_VERSION_BY_CHAIN_ID[chainId] ?? null;

    if (!this.forkVersion) {
      throw new Error(
        `GENESIS_FORK_VERSION not found for chain ID: ${chainId}. ` +
          `Please add the fork version to GENESIS_FORK_VERSION_BY_CHAIN_ID in bls.constants.ts`,
      );
    }
  }

  private forkVersion: Uint8Array | null = null;

  public verify(depositData: DepositData): boolean {
    if (!this.forkVersion) {
      throw new Error('Fork version is not set');
    }

    try {
      const { pubkey, wc, amount, signature } = depositData;

      const depositMessage = {
        pubkey: BLSPubkey.fromJson(pubkey),
        withdrawalCredentials: Bytes32.fromJson(wc),
        amount: UintNum64.deserialize(fromHexString(amount)),
      };

      const domain = this.computeDomain(
        DOMAIN_DEPOSIT,
        this.forkVersion,
        ZERO_HASH,
      );

      const signingRoot = this.computeSigningRoot(
        DepositMessage,
        depositMessage,
        domain,
      );

      const blsPublicKey = blst.PublicKey.fromBytes(depositMessage.pubkey);
      const blsSignature = blst.Signature.fromBytes(fromHexString(signature));

      return blst.verify(signingRoot, blsPublicKey, blsSignature);
    } catch (error) {
      this.logger.warn('Deposit data is not valid', {
        ...depositData,
        error: String(error),
      });

      return false;
    }
  }

  private computeDomain(
    domainType: Uint8Array,
    forkVersion: Uint8Array,
    genesisValidatorRoot: Uint8Array,
  ): Uint8Array {
    const forkDataRoot = this.computeForkDataRoot(
      forkVersion,
      genesisValidatorRoot,
    );

    const domain = new Uint8Array(32);
    domain.set(domainType, 0);
    domain.set(forkDataRoot.slice(0, 28), 4);
    return domain;
  }

  private computeForkDataRoot(
    currentVersion: Uint8Array,
    genesisValidatorsRoot: Uint8Array,
  ): Uint8Array {
    return ForkData.hashTreeRoot({ currentVersion, genesisValidatorsRoot });
  }

  private computeSigningRoot<T>(
    type: Type<T>,
    sszObject: T,
    domain: Uint8Array,
  ): Uint8Array {
    const objectRoot = type.hashTreeRoot(sszObject);
    return SigningData.hashTreeRoot({ objectRoot, domain });
  }
}
