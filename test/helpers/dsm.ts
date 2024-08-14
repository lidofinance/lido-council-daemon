import { ethers } from 'ethers';
import {
  SECURITY_MODULE,
  SECURITY_MODULE_OWNER,
  GANACHE_PORT,
  NO_PRIVKEY_MESSAGE,
} from '../constants';
import { SecurityAbi__factory } from 'generated';

export async function addGuardians(
  params = {
    securityModule: SECURITY_MODULE,
    securityModuleOwner: SECURITY_MODULE_OWNER,
  },
) {
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);

  const tempProvider = new ethers.providers.JsonRpcProvider(
    `http://127.0.0.1:${GANACHE_PORT}`,
  );
  const wallet = new ethers.Wallet(
    process.env.WALLET_PRIVATE_KEY,
    tempProvider,
  );

  await wallet.sendTransaction({
    to: params.securityModuleOwner,
    value: ethers.utils.parseEther('5'),
  });

  const tempSigner = tempProvider.getSigner(params.securityModuleOwner);

  const securityContract = SecurityAbi__factory.connect(
    params.securityModule,
    tempSigner,
  );
  await securityContract.functions.addGuardian(wallet.address, 1);
}
