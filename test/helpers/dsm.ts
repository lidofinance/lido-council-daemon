import { ethers } from 'ethers';
import {
  SECURITY_MODULE,
  SECURITY_MODULE_OWNER,
  NO_PRIVKEY_MESSAGE,
} from '../constants';
import { SecurityAbi__factory } from 'generated';
import { testSetupProvider } from './provider';

function createWallet(provider: ethers.providers.JsonRpcProvider) {
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  return new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);
}

export async function addGuardians(
  params = {
    securityModule: SECURITY_MODULE,
    securityModuleOwner: SECURITY_MODULE_OWNER,
  },
) {
  // const provider = createProvider();
  const wallet = createWallet(testSetupProvider);

  // Convert the ETH amount to wei
  const amountInWei = ethers.utils.parseEther('5');

  await testSetupProvider.send('hardhat_setBalance', [
    params.securityModuleOwner,
    ethers.utils.hexlify(amountInWei),
  ]);

  const signer = testSetupProvider.getSigner(params.securityModuleOwner);

  const securityContract = SecurityAbi__factory.connect(
    params.securityModule,
    signer,
  );
  await securityContract.functions.addGuardian(wallet.address, 1);
}

export async function setGuardianBalance(eth: string) {
  const wallet = createWallet(testSetupProvider);

  // Convert the ETH amount to wei
  const amountInWei = ethers.utils.parseEther(eth);

  await testSetupProvider.send('hardhat_setBalance', [
    wallet.address,
    ethers.utils.hexlify(amountInWei),
  ]);
}
