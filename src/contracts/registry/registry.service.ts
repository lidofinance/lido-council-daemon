import { Injectable } from '@nestjs/common';
import { arrayify, hexlify } from '@ethersproject/bytes';
import { RegistryAbi, RegistryAbi__factory } from 'generated';
import { ProviderService } from 'provider';
import { getRegistryAddress } from './registry.constants';
import { SecurityService } from 'contracts/security';

@Injectable()
export class RegistryService {
  constructor(
    private providerService: ProviderService,
    private securityService: SecurityService,
  ) {}

  private cachedContract: RegistryAbi | null = null;
  private cachedPubKeyLength: number | null = null;

  public async getContract(): Promise<RegistryAbi> {
    if (!this.cachedContract) {
      const address = await this.getRegistryAddress();
      const provider = this.providerService.provider;
      this.cachedContract = RegistryAbi__factory.connect(address, provider);
    }

    return this.cachedContract;
  }

  public async getPubkeyLength(): Promise<number> {
    if (!this.cachedPubKeyLength) {
      const contract = await this.getContract();
      const keyLength = await contract.PUBKEY_LENGTH();
      this.cachedPubKeyLength = keyLength.toNumber();
    }

    return this.cachedPubKeyLength;
  }

  public async splitPubKeys(hexString: string) {
    const pubkeyLength = await this.getPubkeyLength();
    const byteArray = arrayify(hexString);
    const splittedKeys = this.splitPubKeysArray(byteArray, pubkeyLength).map(
      (array) => hexlify(array),
    );

    return splittedKeys;
  }

  public splitPubKeysArray(array: Uint8Array, keyLength: number): Uint8Array[] {
    const keysNumber = array.length / keyLength;

    if (keyLength <= 0) throw new Error('Invalid key length size');
    if (keysNumber % 1 > 0) throw new Error('Invalid array length');

    const result: Uint8Array[] = [];
    for (let i = 0; i < array.length; i += keyLength) {
      result.push(array.slice(i, i + keyLength));
    }

    return result;
  }

  public async getRegistryAddress(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getRegistryAddress(chainId);
  }

  public async getNextSigningKeys() {
    const [contract, maxDepositKeys, lidoAddress] = await Promise.all([
      this.getContract(),
      this.securityService.getMaxDeposits(),
      this.securityService.getLidoContractAddress(),
    ]);

    const overrides = { from: lidoAddress };
    const [pubKeys] = await contract.callStatic.assignNextSigningKeys(
      maxDepositKeys,
      overrides,
    );

    const splittedKeys = this.splitPubKeys(pubKeys);
    return splittedKeys;
  }

  public async getKeysOpIndex(): Promise<number> {
    const contract = await this.getContract();
    const keysOpIndex = await contract.getKeysOpIndex();

    return keysOpIndex.toNumber();
  }
}
