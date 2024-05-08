import { ContractFactory, ethers, providers, Signer, Wallet } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { DSM_V3_BYTECODE, LIDO_LOCATOR_BYTECODE } from './bytecode';
import { LocatorAbi__factory, SecurityAbi__factory } from 'generated';
import { JsonRpcProvider } from '@ethersproject/providers';
import { LIDO_LOCATOR_BY_NETWORK } from 'contracts/repository/locator/locator.constants';

dotenv.config();

export const SECURITY_CONTRACT_OWNER =
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

// Provider and signer setup
function setupProviderSigner(rpc_url: string, impersonate_account: string) {
  const provider = new providers.JsonRpcProvider(rpc_url);
  const signer = provider.getSigner(impersonate_account);
  return { provider, signer };
}

// Impersonate an account
async function impersonateAccount(provider: JsonRpcProvider, account: string) {
  await provider.send('anvil_impersonateAccount', [account]);
}

// Set account balance
async function setBalance(
  provider: JsonRpcProvider,
  account: string,
  eth: string,
) {
  const balance = ethers.utils.hexlify(ethers.utils.parseEther(eth));
  await provider.send('anvil_setBalance', [account, balance]);
}

// Load ABI from file
function loadAbi(abiFile: string): any {
  try {
    const abiData = fs.readFileSync(abiFile, 'utf-8');
    return JSON.parse(abiData);
  } catch (error) {
    console.error('Error loading ABI:', error);
    return null;
  }
}

// Deploy security contract
async function deploySecurityContract(
  signer: Signer,
  security_abi_path: string,
): Promise<string> {
  const abi = loadAbi(security_abi_path);
  const securityContractFactory = new ContractFactory(
    abi,
    DSM_V3_BYTECODE,
    signer,
  );
  const contract = await securityContractFactory.deploy([]);
  await contract.deployed();

  console.log('DSM address:', contract.address);

  return contract.address;
}

// Deploy locator contract
async function deployLocatorContract(
  oldLocator: any,
  dsmAddress: string,
  signer: Signer,
  locator_abi_path: string,
): Promise<string> {
  const abi = loadAbi(locator_abi_path);
  const locatorContractFactory = new ContractFactory(
    abi,
    LIDO_LOCATOR_BYTECODE,
    signer,
  );

  const accountingOracle = await oldLocator.accountingOracle();
  const elRewardsVault = await oldLocator.elRewardsVault();
  const legacyOracle = await oldLocator.legacyOracle();
  const lido = await oldLocator.lido();
  const oracleReportSanityChecker =
    await oldLocator.oracleReportSanityChecker();
  const postTokenRebaseReceiver = await oldLocator.postTokenRebaseReceiver();
  const burner = await oldLocator.burner();
  const stakingRouter = await oldLocator.stakingRouter();
  const treasury = await oldLocator.treasury();
  const validatorsExitBusOracle = await oldLocator.validatorsExitBusOracle();
  const withdrawalQueue = await oldLocator.withdrawalQueue();
  const withdrawalVault = await oldLocator.withdrawalVault();
  const oracleDaemonConfig = await oldLocator.oracleDaemonConfig();

  const contract = await locatorContractFactory.deploy([
    accountingOracle,
    dsmAddress,
    elRewardsVault,
    legacyOracle,
    lido,
    oracleReportSanityChecker,
    postTokenRebaseReceiver,
    burner,
    stakingRouter,
    treasury,
    validatorsExitBusOracle,
    withdrawalQueue,
    withdrawalVault,
    oracleDaemonConfig,
  ]);
  await contract.deployed();

  console.log('Locator address', contract.address);

  return contract.address;
}

// Retrieve the old locator
async function getOldLocator(provider: JsonRpcProvider): Promise<any> {
  const { chainId } = await provider.getNetwork();
  const locator_address = LIDO_LOCATOR_BY_NETWORK[chainId];
  return LocatorAbi__factory.connect(locator_address, provider);
}

// Initialize contracts (main orchestrator)
async function initializeContractsV3(
  rpc_url: string,
  security_abi_path: string,
  locator_abi_path: string,
) {
  const { provider, signer } = setupProviderSigner(
    rpc_url,
    SECURITY_CONTRACT_OWNER,
  );

  await impersonateAccount(provider, SECURITY_CONTRACT_OWNER);
  await setBalance(provider, SECURITY_CONTRACT_OWNER, '10');

  const dsm_address = await deploySecurityContract(signer, security_abi_path);
  const oldLocator = await getOldLocator(provider);
  const locator_address = await deployLocatorContract(
    oldLocator,
    dsm_address,
    signer,
    locator_abi_path,
  );

  return { dsm_address, locator_address };
}

export { initializeContractsV3 };
