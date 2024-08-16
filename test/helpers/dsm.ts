import { ethers } from 'ethers';
import {
  SECURITY_MODULE,
  SECURITY_MODULE_OWNER,
  GANACHE_PORT,
  NO_PRIVKEY_MESSAGE,
} from '../constants';
import { SecurityAbi__factory } from 'generated';

function createProvider() {
  return new ethers.providers.JsonRpcProvider(
    `http://127.0.0.1:${GANACHE_PORT}`,
  );
}

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
  const provider = createProvider();
  const wallet = createWallet(provider);

  // Convert the ETH amount to wei
  const amountInWei = ethers.utils.parseEther('5');

  const tx = await wallet.sendTransaction({
    to: params.securityModuleOwner,
    value: amountInWei,
  });

  // Wait for the transaction to be mined
  await tx.wait();

  const signer = provider.getSigner(params.securityModuleOwner);

  const securityContract = SecurityAbi__factory.connect(
    params.securityModule,
    signer,
  );
  await securityContract.functions.addGuardian(wallet.address, 1);
}

export async function setGuardianBalance(eth: string) {
  const provider = createProvider();
  const wallet = createWallet(provider);

  // Convert the ETH amount to wei
  const amountInWei = ethers.utils.parseEther(eth);

  await provider.send('evm_setAccountBalance', [
    wallet.address,
    ethers.utils.hexlify(amountInWei),
  ]);
}
