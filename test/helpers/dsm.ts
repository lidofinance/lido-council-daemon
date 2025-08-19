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

export async function canDeposit() {
  const locator = getLocator();
  const lidoAddress = await locator.lido();
  const dsm = await locator.depositSecurityModule();

  const signer = testSetupProvider.getSigner(dsm);

  const lido = LidoAbi__factory.connect(lidoAddress, signer);
  const res = await lido.canDeposit();
  return res;
}

export async function deposit(moduleId: number, depositCount = 1) {
  console.log(
    `Starting deposit process for moduleId: ${moduleId}, depositCount: ${depositCount}`,
  );

  const locator = getLocator();
  console.log('Getting deposit security module address...');
  const dsm = await locator.depositSecurityModule();
  console.log(`Deposit security module address: ${dsm}`);

  console.log('Getting Lido contract address...');
  const lidoAddress = await locator.lido();
  console.log(`Lido contract address: ${lidoAddress}`);

  console.log('Getting withdrawal queue address...');
  const withdrawalQueueAddress = await locator.withdrawalQueue();
  console.log(`Withdrawal queue address: ${withdrawalQueueAddress}`);

  console.log('Getting network information...');
  const network = await testSetupProvider.getNetwork();
  const CHAIN_ID = network.chainId;
  console.log(`Network chain ID: ${CHAIN_ID}`);
  const voting = VOTING[CHAIN_ID];

  console.log('Impersonating accounts and setting balances...');
  await accountImpersonate(dsm);
  await accountImpersonate(voting);
  await setBalance(dsm, 100);
  await setBalance(voting, 100);
  console.log('Account impersonation and balance setting completed');

  const signer = testSetupProvider.getSigner(dsm);

  const lido = LidoAbi__factory.connect(lidoAddress, signer);
  const withdrawalQueue = new Contract(
    withdrawalQueueAddress,
    wqAbi,
    testSetupProvider,
  );

  const votingSigner = testSetupProvider.getSigner(voting);

  const lidoVotingSigner = LidoAbi__factory.connect(lidoAddress, votingSigner);

  console.log('Fetching unfinalized stETH amount from withdrawal queue...');
  const unfinalizedStETHWei = await withdrawalQueue.unfinalizedStETH();
  console.log(
    `Unfinalized stETH: ${ethers.utils.formatEther(unfinalizedStETHWei)} ETH`,
  );

  console.log('Fetching buffered ether from Lido...');
  const depositableEtherWei = await lido.getBufferedEther();
  console.log(
    `Buffered ether: ${ethers.utils.formatEther(depositableEtherWei)} ETH`,
  );

  // If amount negative, this value show how much eth we need to satisfy withdrawals
  // If possitive, it is the value we can use for deposits
  const amountForDeposits = depositableEtherWei
    .sub(unfinalizedStETHWei)
    .abs()
    .add(ethers.utils.parseEther((depositCount * 32).toString()));
  const amountForDepositsInEth = ethers.utils.formatEther(amountForDeposits);
  console.log(`Calculated amount for deposits: ${amountForDepositsInEth} ETH`);

  // TODO: check current stake limit and increase it on value i need
  //
  console.log('Checking if staking control permission is needed...');

  // Grant STAKING_CONTROL_ROLE permission via ACL contract
  const aclAbi = [
    'function grantPermission(address _entity, address _app, bytes32 _role)',
  ];

  console.log('Getting DAO and ACL contracts...');
  const daoAddress = '0x3b03f75Ec541Ca11a223bB58621A3146246E1644'; // Hardcoded for holesky
  await accountImpersonate(daoAddress);

  const kernelAbi = [
    'function acl() view returns (address)',
    'function APP_MANAGER_ROLE() view returns (bytes32)',
    'function getAddress() view returns (address)',
  ];

  const dao = new Contract(daoAddress, kernelAbi, votingSigner);
  const aclAddress = await dao.acl();
  const acl = new Contract(aclAddress, aclAbi, votingSigner);
  const APP_MANAGER_ROLE = await dao.APP_MANAGER_ROLE();

  console.log('Creating ACL permission...');
  await acl.createPermission(voting, daoAddress, APP_MANAGER_ROLE);

  console.log('Getting STAKING_CONTROL_ROLE...');
  const stakingControlRole = await lido.STAKING_CONTROL_ROLE();

  console.log('Granting STAKING_CONTROL_ROLE permission...');
  const grantTx = await acl.grantPermission(
    voting,
    lidoAddress,
    stakingControlRole,
  );
  await grantTx.wait();
  console.log('Permission granted successfully');

  console.log('Setting staking limit...');
  await lidoVotingSigner.setStakingLimit(
    ethers.utils.parseEther(amountForDepositsInEth), // _maxStakeLimit
    ethers.utils.parseEther(amountForDepositsInEth), // _stakeLimitIncreasePerBlock
  );
  console.log('Staking limit set successfully');

  console.log('Waiting 12 seconds for transaction to settle...');
  await new Promise((res) => setTimeout(res, 12000));

  console.log(`Transferring ${amountForDepositsInEth} ETH to Lido contract...`);
  await transferEther(lidoAddress, amountForDepositsInEth);
  console.log('ETH transfer completed');

  console.log('Waiting another 12 seconds for transfer to settle...');
  await new Promise((res) => setTimeout(res, 12000));

  console.log(`Initiating deposit to module ${moduleId}...`);
  const tx = await lido.deposit(1, moduleId, new Uint8Array());
  console.log(`Deposit transaction hash: ${tx.hash}`);

  console.log('Waiting for deposit transaction to be mined...');
  await tx.wait();
  console.log('Deposit transaction confirmed and deposit process completed');
}

export async function transferEther(recipientAddress: string, amount: string) {
  console.log(
    `Starting ETH transfer to ${recipientAddress} for amount: ${amount} ETH`,
  );

  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
  const signer = testSetupProvider.getSigner(wallet.address);

  console.log('Setting balance for sender wallet...');
  await setBalance(wallet.address, 1000000);
  console.log('Sender wallet balance set');

  const tx = {
    to: recipientAddress,
    value: ethers.utils.parseEther(amount),
  };

  console.log('Sending transaction...');
  const transactionResponse = await signer.sendTransaction(tx);
  console.log(`Transaction sent with hash: ${transactionResponse.hash}`);

  console.log('Waiting for transaction confirmation...');
  await transactionResponse.wait();
  console.log('ETH transfer transaction confirmed');
}
