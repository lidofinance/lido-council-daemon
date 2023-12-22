import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';

export function getVettedUnusedKeys(
  operators: RegistryOperator[],
  unusedKeys: RegistryKey[],
): RegistryKey[] {
  return operators.flatMap((operator) => {
    const operatorKeys = unusedKeys
      .filter((key) => key.operatorIndex === operator.index)
      .sort((a, b) => a.index - b.index)
      .slice(0, operator.stakingLimit - operator.usedSigningKeys);

    return operatorKeys;
  });
}
