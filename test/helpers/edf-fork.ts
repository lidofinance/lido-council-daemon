import { ContractFactory, ContractReceipt, Signer, Wallet } from 'ethers';
import {
  DelegationContractAbi__factory,
  DelegationFactoryAbi__factory,
  LocatorAbi,
  LocatorAbi__factory,
  OssifiableProxyAbi__factory,
  SecurityAbi__factory,
  SecurityV5Abi__factory,
} from 'generated';
import * as delegationFactoryFixture from '../fixtures/contracts/delegation-factory.bytecode.json';
import * as depositSecurityModuleV5Fixture from '../fixtures/contracts/deposit-security-module-v5.bytecode.json';
import * as lidoLocatorFixture from '../fixtures/contracts/lido-locator.bytecode.json';
import { accountImpersonate, setBalance, testSetupProvider } from './provider';

export const LOCATOR_CONFIG_KEYS = [
  'accountingOracle',
  'depositSecurityModule',
  'elRewardsVault',
  'lido',
  'oracleReportSanityChecker',
  'postTokenRebaseReceiver',
  'burner',
  'stakingRouter',
  'treasury',
  'validatorsExitBusOracle',
  'withdrawalQueue',
  'withdrawalVault',
  'oracleDaemonConfig',
  'validatorExitDelayVerifier',
  'triggerableWithdrawalsGateway',
  'consolidationGateway',
  'accounting',
  'predepositGuarantee',
  'wstETH',
  'vaultHub',
  'vaultFactory',
  'lazyOracle',
  'operatorGrid',
  'topUpGateway',
] as const;

export type LocatorConfigKey = typeof LOCATOR_CONFIG_KEYS[number];
export type LocatorConfig = Record<LocatorConfigKey, string>;

export interface EdfForkDeployment {
  previousDsmAddress: string;
  previousLocatorImplementation: string;
  delegationFactoryAddress: string;
  delegationContractAddress: string;
  delegateAddress: string;
  dsmAddress: string;
  locatorImplementationAddress: string;
  locatorConfigBefore: LocatorConfig;
  activate(): Promise<ContractReceipt>;
}

const DELEGATE_COOLDOWN_SECONDS = 7 * 24 * 60 * 60;

export async function readLocatorConfig(
  locator: LocatorAbi,
): Promise<LocatorConfig> {
  const entries = await Promise.all(
    LOCATOR_CONFIG_KEYS.map(async (key) => {
      const getter = locator[key] as () => Promise<string>;
      return [key, await getter()] as const;
    }),
  );

  return Object.fromEntries(entries) as LocatorConfig;
}

export async function deployEdfUpgradeOnFork(
  locatorAddress: string,
  deployer: Signer = testSetupProvider.getSigner(0),
): Promise<EdfForkDeployment> {
  const delegateAddress = await deployer.getAddress();
  const currentLocator = LocatorAbi__factory.connect(
    locatorAddress,
    testSetupProvider,
  );
  const locatorConfigBefore = await readLocatorConfig(currentLocator);
  const previousDsmAddress = locatorConfigBefore.depositSecurityModule;
  const previousDsm = SecurityAbi__factory.connect(
    previousDsmAddress,
    testSetupProvider,
  );
  const locatorProxy = OssifiableProxyAbi__factory.connect(
    locatorAddress,
    testSetupProvider,
  );

  const [
    depositContractAddress,
    pauseIntentValidityPeriodBlocks,
    maxOperatorsPerUnvetting,
    previousDsmOwner,
    previousLocatorImplementation,
  ] = await Promise.all([
    previousDsm.DEPOSIT_CONTRACT(),
    previousDsm.getPauseIntentValidityPeriodBlocks(),
    previousDsm.getMaxOperatorsPerUnvetting(),
    previousDsm.getOwner(),
    locatorProxy.proxy__getImplementation(),
  ]);

  const delegationFactoryDeployment = await new ContractFactory(
    DelegationFactoryAbi__factory.abi,
    delegationFactoryFixture.bytecode,
    deployer,
  ).deploy();
  await delegationFactoryDeployment.deployed();

  const delegationFactory = DelegationFactoryAbi__factory.connect(
    delegationFactoryDeployment.address,
    deployer,
  );
  const delegationOwner = Wallet.createRandom().address;
  const delegationContractAddress = await delegationFactory.callStatic.deploy(
    delegationOwner,
    delegateAddress,
    DELEGATE_COOLDOWN_SECONDS,
  );
  await (
    await delegationFactory.deploy(
      delegationOwner,
      delegateAddress,
      DELEGATE_COOLDOWN_SECONDS,
    )
  ).wait();

  const delegationContract = DelegationContractAbi__factory.connect(
    delegationContractAddress,
    testSetupProvider,
  );
  const activeDelegate = await delegationContract.getDelegate();
  if (activeDelegate !== delegateAddress) {
    throw new Error(
      `DelegationContract ${delegationContractAddress} returned unexpected initial delegate ${activeDelegate}`,
    );
  }

  const dsmDeployment = await new ContractFactory(
    SecurityV5Abi__factory.abi,
    depositSecurityModuleV5Fixture.bytecode,
    deployer,
  ).deploy(
    depositContractAddress,
    locatorConfigBefore.stakingRouter,
    pauseIntentValidityPeriodBlocks,
    maxOperatorsPerUnvetting,
  );
  await dsmDeployment.deployed();

  const dsm = SecurityV5Abi__factory.connect(dsmDeployment.address, deployer);
  await (await dsm.addGuardian(delegationContractAddress, 1)).wait();
  await (await dsm.setOwner(previousDsmOwner)).wait();

  const locatorConfigAfter: LocatorConfig = {
    ...locatorConfigBefore,
    depositSecurityModule: dsm.address,
  };
  const locatorImplementationDeployment = await new ContractFactory(
    LocatorAbi__factory.abi,
    lidoLocatorFixture.bytecode,
    deployer,
  ).deploy(locatorConfigAfter);
  await locatorImplementationDeployment.deployed();

  return {
    previousDsmAddress,
    previousLocatorImplementation,
    delegationFactoryAddress: delegationFactory.address,
    delegationContractAddress,
    delegateAddress,
    dsmAddress: dsm.address,
    locatorImplementationAddress: locatorImplementationDeployment.address,
    locatorConfigBefore,
    async activate(): Promise<ContractReceipt> {
      const proxyAdmin = await locatorProxy.proxy__getAdmin();
      await accountImpersonate(proxyAdmin);
      await setBalance(proxyAdmin, 10);

      const proxyWithAdmin = OssifiableProxyAbi__factory.connect(
        locatorAddress,
        testSetupProvider.getSigner(proxyAdmin),
      );
      const transaction = await proxyWithAdmin.proxy__upgradeTo(
        locatorImplementationDeployment.address,
      );

      return await transaction.wait();
    },
  };
}
