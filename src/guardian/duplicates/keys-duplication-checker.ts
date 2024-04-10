import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

/**
 * Function identify original keys and return only duplicated keys
 */
export function getDuplicatedKeys(keys: RegistryKey[]): RegistryKey[] {
  // list of all duplicates
  // first element of subarrays is a key, second - all it's occurances
  const duplicatedKeys: [string, RegistryKey[]][] = identifyDuplicateKeys(keys);

  const duplicates: RegistryKey[] = [];

  // filter original messages
  for (const [_, occurrences] of duplicatedKeys) {
    // console.log(occurrences);
    // If the list of duplicates contains a deposited key, it will be considered the original,
    // and the other keys will be considered duplicates.
    // This applies whether the keys are in one module or two, and whether they are for one operator or two.

    //TODO: is it possible to have 2 deposited duplicates?
    if (occurrences.some((key) => key.used)) {
      const notDepositedKeys = filterDepositedKeys(occurrences);
      duplicates.push(...notDepositedKeys);

      continue;
    }

    // If the list does not contain any deposited keys and all keys belong to a single operator,
    if (
      new Set(
        occurrences.map((key) => `${key.moduleAddress}-${key.operatorIndex}`),
      ).size == 1
    ) {
      // Since the list contains keys from a single operator, we identify the original key by selecting the one with the smallest index
      const duplicatesAcrossOneOperator = handleDuplicatesByIndex(occurrences);
      duplicates.push(...duplicatesAcrossOneOperator);

      continue;
    }

    duplicates.push(...occurrences);
  }

  return duplicates;
}

export function identifyDuplicateKeys(
  keys: RegistryKey[],
): [string, RegistryKey[]][] {
  const keysOccurrences = new Map<string, RegistryKey[]>();
  keys.forEach((key) => {
    const occurrences = keysOccurrences.get(key.key) || [];
    occurrences.push(key);
    keysOccurrences.set(key.key, occurrences);
  });
  return [...keysOccurrences].filter(
    ([_, occurrences]) => occurrences.length > 1,
  );
}

function filterDepositedKeys(occurrences: RegistryKey[]): RegistryKey[] {
  return occurrences.filter((key) => !key.used);
}

function handleDuplicatesByIndex(occurrences: RegistryKey[]): RegistryKey[] {
  // Assuming occurrences belong to a single operator
  const originalKey = occurrences.reduce(
    (prev, curr) => (prev.index < curr.index ? prev : curr),
    occurrences[0],
  );
  return occurrences.filter((key) => key.index !== originalKey.index);
}
