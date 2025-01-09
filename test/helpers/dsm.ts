import { ethers } from 'ethers';
import { NO_PRIVKEY_MESSAGE } from '../constants';
import { LidoAbi__factory, SecurityAbi__factory } from 'generated';
import { accountImpersonate, setBalance, testSetupProvider } from './provider';
import { getLocator } from './sr.contract';
import { Contract } from '@ethersproject/contracts';
import { wqAbi } from './wq.abi';
import { VOTING } from './voting';

function createWallet(provider: ethers.providers.JsonRpcProvider) {
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  return new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);
}

// return with owner sign owner
export async function getSecurityContract() {
  const locator = await getLocator();
  const dsm = await locator.depositSecurityModule();

  return SecurityAbi__factory.connect(dsm, testSetupProvider);
}

export async function getSecurityOwner() {
  const dsm = await getSecurityContract();

  return await dsm.getOwner();
}

export async function getLidoWC() {
  const locator = getLocator();
  const lido = await locator.lido();
  const contract = LidoAbi__factory.connect(lido, testSetupProvider);
  return await contract.getWithdrawalCredentials();
}

export async function getGuardians() {
  const contract = await getSecurityContract();
  return await contract.getGuardians();
}

export async function isDepositsPaused() {
  const contract = await getSecurityContract();
  return await contract.isDepositsPaused();
}

export async function addGuardians(params: {
  securityModuleOwner: string;
  securityModuleAddress: string;
}) {
  await accountImpersonate(params.securityModuleOwner);
  const wallet = createWallet(testSetupProvider);

  await setBalance(params.securityModuleOwner, 5);

  const signer = testSetupProvider.getSigner(params.securityModuleOwner);

  const securityContract = SecurityAbi__factory.connect(
    params.securityModuleAddress,
    signer,
  );
  await securityContract.functions.addGuardian(wallet.address, 1);
}

export async function setGuardianBalance(eth: string) {
  const wallet = createWallet(testSetupProvider);

  await setBalance(wallet.address, Number(eth));
}

export async function deposit(moduleId: number) {
  const locator = getLocator();
  const dsm = await locator.depositSecurityModule();
  const lidoAddress = await locator.lido();
  const withdrawalQueueAddress = await locator.withdrawalQueue();
  const network = await testSetupProvider.getNetwork();
  const CHAIN_ID = network.chainId;
  const voting = VOTING[CHAIN_ID];

  await accountImpersonate(dsm);
  await accountImpersonate(voting);
  await setBalance(dsm, 100);
  await setBalance(voting, 100);

  const signer = testSetupProvider.getSigner(dsm);

  const lido = LidoAbi__factory.connect(lidoAddress, signer);
  const withdrawalQueue = new Contract(
    withdrawalQueueAddress,
    wqAbi,
    testSetupProvider,
  );

  const votingSigner = testSetupProvider.getSigner(voting);

  const lidoVotingSigner = LidoAbi__factory.connect(lidoAddress, votingSigner);

  const unfinalizedStETHWei = await withdrawalQueue.unfinalizedStETH();
  const depositableEtherWei = await lido.getBufferedEther();

  // If amount negative, this value show how much eth we need to satisfy withdrawals
  // If possitive, it is the value we can use for deposits
  const amountForDeposits = depositableEtherWei
    .sub(unfinalizedStETHWei)
    .abs()
    .add(ethers.utils.parseEther('100000'));
  const amountForDepositsInEth = ethers.utils.formatEther(amountForDeposits);

  await lidoVotingSigner.setStakingLimit(
    ethers.utils.parseEther(amountForDepositsInEth), // _maxStakeLimit
    ethers.utils.parseEther(amountForDepositsInEth), // _stakeLimitIncreasePerBlock
  );

  await new Promise((res) => setTimeout(res, 12000));

  await transferEther(lidoAddress, amountForDepositsInEth);

  await new Promise((res) => setTimeout(res, 12000));

  //TODO: check how many keys waiting deposit
  const tx = await lido.deposit(1, moduleId, new Uint8Array());

  await tx.wait();
}

export async function transferEther(recipientAddress: string, amount: string) {
  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
  const signer = testSetupProvider.getSigner(wallet.address);
  await setBalance(wallet.address, 1000000);

  const tx = {
    to: recipientAddress,
    value: ethers.utils.parseEther(amount),
  };

  const transactionResponse = await signer.sendTransaction(tx);

  await transactionResponse.wait();
}
