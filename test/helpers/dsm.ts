import { ethers } from 'ethers';
import {
  SECURITY_MODULE,
  SECURITY_MODULE_OWNER,
  NO_PRIVKEY_MESSAGE,
} from '../constants';
import { LidoAbi__factory, SecurityAbi__factory } from 'generated';
import { accountImpersonate, setBalance, testSetupProvider } from './provider';
import { getLocator } from './sr.contract';
import { Contract } from '@ethersproject/contracts';

// TODO: read from locator
const DSM = '0x808DE3b26Be9438F12E9B45528955EA94C17f217';
const LIDO = '0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034';

function createWallet(provider: ethers.providers.JsonRpcProvider) {
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  return new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);
}

export async function getSecurityContract() {
  const locator = getLocator();
  const dsm = await locator.depositSecurityModule();
  const abi = [
    {
      inputs: [],
      name: 'getOwner',
      outputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'DEPOSIT_CONTRACT',
      outputs: [
        {
          internalType: 'contract IDepositContract',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ];

  return new Contract(dsm, abi, testSetupProvider);
}

export async function getSecurityOwner() {
  const dsm = await getSecurityContract();

  return await dsm.getOwner();
}

export async function getLidoWC() {
  const locator = getLocator();
  const lido = await locator.lido();

  const abi = [
    {
      constant: true,
      inputs: [],
      name: 'getWithdrawalCredentials',
      outputs: [{ name: '', type: 'bytes32' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  ];

  const contract = new Contract(lido, abi, testSetupProvider);
  const wc = await contract.getWithdrawalCredentials();

  console.log('wc=', wc);

  return wc;
}

export async function getGuardians() {
  const dsm = await getSecurityContract();
  const securityContract = SecurityAbi__factory.connect(
    dsm.address,
    testSetupProvider,
  );

  return await securityContract.getGuardians();
}

export async function addGuardians(
  params = {
    securityModule: SECURITY_MODULE,
    securityModuleOwner: SECURITY_MODULE_OWNER,
  },
) {
  console.log('params=', params);
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

export async function deposit(depositsCount: number, moduleId: number) {
  await accountImpersonate(DSM);
  await setBalance(DSM, 3);

  await transferEther(LIDO, '100');

  const signer = testSetupProvider.getSigner(DSM);

  const lido = LidoAbi__factory.connect(LIDO, signer);

  const n = await lido.getDepositableEther();
  console.log('buffered eth = ', Number(n));

  const tx = await lido.deposit(depositsCount, moduleId, new Uint8Array());

  await tx.wait();
}

export async function transferEther(recipientAddress: string, amount: string) {
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
  const signer = testSetupProvider.getSigner(wallet.address);
  await setBalance(wallet.address, 320);

  const tx = {
    to: recipientAddress,
    value: ethers.utils.parseEther(amount),
  };

  const transactionResponse = await signer.sendTransaction(tx);

  await transactionResponse.wait();
}
