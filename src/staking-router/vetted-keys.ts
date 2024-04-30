import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';

export function getVettedUnusedKeys(vettedKeys: RegistryKey[]): RegistryKey[] {
  return vettedKeys.filter((key) => !key.used);
}

export function getVettedKeys(
  operators: RegistryOperator[],
  unusedKeys: RegistryKey[],
): RegistryKey[] {
  return operators.flatMap((operator) => {
    const operatorKeys = unusedKeys
      .filter((key) => key.operatorIndex === operator.index)
      .sort((a, b) => a.index - b.index)
      // stakingLimit limit cant be less than usedSigningKeys
      .slice(0, operator.stakingLimit);

    return operatorKeys;
  });
}
