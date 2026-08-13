import { ethers } from 'ethers';
import { NO_PRIVKEY_MESSAGE } from '../constants';
import {
  LidoAbi__factory,
  SecurityAbi__factory,
  StakingRouterAbi__factory,
} from 'generated';
import { accountImpersonate, setBalance, testSetupProvider } from './provider';
import { getLocator } from './sr.contract';
import { Contract } from '@ethersproject/contracts';
import { wqAbi } from './wq.abi';
import { AGENT, CHAIN_ID, DAO } from './config';

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

// Per-module withdrawal credentials: same base WC, but the first byte (type)
// differs by module (e.g. id 1 -> 0x01..., CMv2 id 5 -> 0x02...).
export async function getModuleWC(moduleId: number) {
  const locator = getLocator();
  const stakingRouterAddress = await locator.stakingRouter();
  const stakingRouter = StakingRouterAbi__factory.connect(
    stakingRouterAddress,
    testSetupProvider,
  );
  return await stakingRouter.getStakingModuleWithdrawalCredentials(moduleId);
}

export async function getGuardians() {
  const contract = await getSecurityContract();
  return await contract.getGuardians();
}

export async function isDepositsPaused() {
  const contract = await getSecurityContract();
  return await contract.isDepositsPaused();
}

export async function waitForDepositsPaused(
  contract: { isDepositsPaused(): Promise<boolean> },
  timeoutMs = 30_000,
  pollIntervalMs = 250,
) {
  const deadline = Date.now() + timeoutMs;

  while (!(await contract.isDepositsPaused())) {
    if (Date.now() >= deadline) {
      throw new Error(`Deposits were not paused within ${timeoutMs} ms`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
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

/**
 * Fill Lido buffer with ETH so that `depositCount` validators can be deposited.
 * Raises staking limit via DAO and submits ETH to Lido.
 * Does NOT call lido.deposit() — use `deposit()` for the full flow.
 */
export async function fillLidoBuffer(depositCount = 1) {
  const locator = getLocator();
  const lidoAddress = await locator.lido();
  const withdrawalQueueAddress = await locator.withdrawalQueue();

  const chainId = CHAIN_ID;
  const agent = AGENT[chainId];
  const daoAddress = DAO[chainId];

  if (!agent) {
    throw new Error(`AGENT address not found for chain ID: ${chainId}`);
  }
  if (!daoAddress) {
    throw new Error(`DAO address not found for chain ID: ${chainId}`);
  }

  // The Aragon Agent manages DAO ACL permissions on fork/devnet.
  await accountImpersonate(agent);
  await setBalance(agent, 100);

  const agentSigner = testSetupProvider.getSigner(agent);
  const lido = LidoAbi__factory.connect(lidoAddress, testSetupProvider);
  const lidoWithAgent = lido.connect(agentSigner);

  const withdrawalQueue = new Contract(
    withdrawalQueueAddress,
    wqAbi,
    testSetupProvider,
  );

  const unfinalizedStETHWei = await withdrawalQueue.unfinalizedStETH();
  const depositableEtherWei = await lido.getBufferedEther();

  const amountForDeposits = depositableEtherWei
    .sub(unfinalizedStETHWei)
    .abs()
    .add(ethers.utils.parseEther((depositCount * 32).toString()));
  const amountForDepositsInEth = ethers.utils.formatEther(amountForDeposits);

  // Grant STAKING_CONTROL_ROLE permission via ACL contract
  const aclAbi = [
    'function grantPermission(address _entity, address _app, bytes32 _role)',
  ];
  const kernelAbi = ['function acl() view returns (address)'];

  const dao = new Contract(daoAddress, kernelAbi, agentSigner);
  const aclAddress = await dao.acl();
  const acl = new Contract(aclAddress, aclAbi, agentSigner);
  const stakingControlRole = await lido.STAKING_CONTROL_ROLE();

  const grantTx = await acl.grantPermission(
    agent,
    lidoAddress,
    stakingControlRole,
  );
  await grantTx.wait();

  await lidoWithAgent.setStakingLimit(
    ethers.utils.parseEther(amountForDepositsInEth),
    ethers.utils.parseEther(amountForDepositsInEth),
  );

  await new Promise((res) => setTimeout(res, 12000));

  await transferEther(lidoAddress, amountForDepositsInEth);

  await new Promise((res) => setTimeout(res, 12000));
}

export async function deposit(moduleId: number, depositCount = 1) {
  const locator = getLocator();
  const dsm = await locator.depositSecurityModule();
  const stakingRouterAddress = await locator.stakingRouter();

  await accountImpersonate(dsm);
  await setBalance(dsm, 100);
  const signer = testSetupProvider.getSigner(dsm);
  const stakingRouter = StakingRouterAbi__factory.connect(
    stakingRouterAddress,
    signer,
  );

  await fillLidoBuffer(depositCount);

  const tx = await stakingRouter.deposit(moduleId, new Uint8Array());
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
