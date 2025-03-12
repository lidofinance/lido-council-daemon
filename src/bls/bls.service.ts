import * as blst from '@chainsafe/blst';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Type, fromHexString } from '@chainsafe/ssz';
import { ProviderService } from 'provider';
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
  EMPTY_SIGNATURE,
  EMPTY_WC,
  GENESIS_FORK_VERSION_BY_CHAIN_ID,
  UintNum64,
  ZERO_HASH,
} from './bls.constants';
import { DepositMessage, ForkData, SigningData } from './bls.containers';
import { DepositData } from './interfaces';

@Injectable()
export class BlsService implements OnModuleInit {
  invalidCounter = 0;
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
  ) {}

  async onModuleInit() {
    const chainId = await this.providerService.getChainId();
    this.forkVersion = GENESIS_FORK_VERSION_BY_CHAIN_ID[chainId] ?? null;
  }

  private forkVersion: Uint8Array | null = null;

  public verify(depositData: DepositData): boolean {
    if (!this.forkVersion) {
      throw new Error('Fork version is not set');
    }

    const { pubkey, wc, amount, signature } = depositData;
    try {
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
      this.invalidCounter++;
      if (signature === EMPTY_SIGNATURE && wc === EMPTY_WC) {
        this.logger.warn('Deposit data is not valid', {
          invalidCount: this.invalidCounter,
        });
        return false;
      }
      this.logger.warn('Deposit data is not valid', {
        ...depositData,
        error: String(error),
        invalidCount: this.invalidCounter,
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
