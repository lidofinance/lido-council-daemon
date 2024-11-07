import { fromHexString } from '@chainsafe/ssz';
import { NO_PRIVKEY_MESSAGE } from '../constants';
import { computeRoot } from './computeDomain';
import { DepositData } from 'bls/bls.containers';
import { ethers } from 'ethers';
import { ProviderService } from 'provider';
import { DepositAbi__factory } from 'generated';
import { SecretKey } from '@chainsafe/blst';
import { getSecurityContract } from './dsm';

export async function signDeposit(
  pk: Uint8Array,
  sk: SecretKey,
  wc: string,
  amountGwei = 32000000000,
): Promise<{
  depositData: any;
  signature: Uint8Array;
}> {
  const depositMessage = {
    pubkey: pk,
    withdrawalCredentials: fromHexString(wc),
    amount: amountGwei,
  };
  const signingRoot = await computeRoot(depositMessage);
  const sign = sk.sign(signingRoot).toBytes();

  const depositData = {
    ...depositMessage,
    signature: sign,
  };

  return { depositData: depositData, signature: sign };
}

export async function makeDeposit(
  depositData: any,
  providerService: ProviderService,
  amount = 32,
): Promise<{ wallet: ethers.Wallet; depositSign: Uint8Array }> {
  const depositDataRoot = DepositData.hashTreeRoot(depositData);

  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);

  // Make a deposit
  const signer = wallet.connect(providerService.provider);
  const dsm = await getSecurityContract();
  const depositContractAddress = await dsm.DEPOSIT_CONTRACT();

  const depositContract = DepositAbi__factory.connect(
    depositContractAddress,
    signer,
  );

  await depositContract.deposit(
    depositData.pubkey,
    depositData.withdrawalCredentials,
    depositData.signature,
    depositDataRoot,
    { value: ethers.constants.WeiPerEther.mul(amount) },
  );

  return { wallet: signer, depositSign: depositData.signature };
}

export function getWalletAddress() {
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
  return wallet.address;
}
