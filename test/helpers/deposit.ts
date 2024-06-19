import { fromHexString } from '@chainsafe/ssz';
import { DEPOSIT_CONTRACT, GOOD_WC, NO_PRIVKEY_MESSAGE } from '../constants';
import { computeRoot } from './computeDomain';
import { DepositData } from 'bls/bls.containers';
import { Wallet, ethers } from 'ethers';
import { ProviderService } from 'provider';
import { DepositAbi__factory } from 'generated';
import { SecretKey } from '@chainsafe/blst';

export async function makeDeposit(
  pk: Uint8Array,
  sk: SecretKey,
  providerService: ProviderService,
  wc = GOOD_WC,
): Promise<{ wallet: Wallet; deposit_sign: Uint8Array }> {
  const goodDepositMessage = {
    pubkey: pk,
    withdrawalCredentials: fromHexString(wc),
    amount: 32000000000, // gwei!
  };
  const goodSigningRoot = computeRoot(goodDepositMessage);
  const goodSig = sk.sign(goodSigningRoot).toBytes();

  const goodDepositData = {
    ...goodDepositMessage,
    signature: goodSig,
  };
  const goodDepositDataRoot = DepositData.hashTreeRoot(goodDepositData);

  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);

  // Make a deposit
  const signer = wallet.connect(providerService.provider);
  const depositContract = DepositAbi__factory.connect(DEPOSIT_CONTRACT, signer);
  await depositContract.deposit(
    goodDepositData.pubkey,
    goodDepositData.withdrawalCredentials,
    goodDepositData.signature,
    goodDepositDataRoot,
    { value: ethers.constants.WeiPerEther.mul(32) },
  );

  return { wallet: signer, deposit_sign: goodSig };
}
