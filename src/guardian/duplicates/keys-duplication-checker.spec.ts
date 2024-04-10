import {
  getDuplicatedKeys,
  identifyDuplicateKeys,
} from './keys-duplication-checker';
import {
  duplicatedKeysOneOperator,
  duplicatedKeysTwoOperatorsSameModule,
  duplicatedKeysDiffModules,
  depositedAndUndepositedDuplicateSameOperator,
  depositedAndUndepositedDuplicateTwoOperatorsSameModule,
  depositedAndUndepositedDuplicateDiffModules,
} from './keys.fixtures';

describe('KeysDuplicationChecker', () => {
  describe('identifyDuplicateKeys', () => {
    it('should identify and return tuples of duplicated keys along with their occurrences', () => {
      const result = identifyDuplicateKeys(duplicatedKeysOneOperator);

      // Construct the expected output explicitly for clarity and accuracy
      const expectedKey =
        '0xb3c90525010a5710d43acbea46047fc37ed55306d032527fa15dd7e8cd8a9a5fa490347cc5fce59936fb8300683cd9f3';
      const expectedOccurrences = duplicatedKeysOneOperator.filter(
        (key) => key.key === expectedKey,
      );

      // Check the number of groups of duplicated keys identified
      expect(result.length).toEqual(1);

      // Check the structure and content of the first group
      const [key, occurrences] = result[0];
      expect(key).toEqual(expectedKey);
      expect(occurrences.length).toEqual(2); // or use expectedOccurrences.length for dynamic checking
      expect(occurrences).toEqual(expect.arrayContaining(expectedOccurrences));
    });
  });

  describe('getDuplicatedKeys', () => {
    it('confirm the list has duplicates from one operator', () => {
      const result = getDuplicatedKeys([...duplicatedKeysOneOperator]);

      const expected = [duplicatedKeysOneOperator[2]];

      expect(result.length).toEqual(1);
      expect(result).toEqual(expect.arrayContaining(expected));
    });

    it('confirm the list has duplicates from different operator of the same module', () => {
      const result = getDuplicatedKeys([
        ...duplicatedKeysTwoOperatorsSameModule,
      ]);

      const expected = [
        duplicatedKeysTwoOperatorsSameModule[1],
        duplicatedKeysTwoOperatorsSameModule[2],
      ];

      expect(result.length).toEqual(2);
      expect(result).toEqual(expect.arrayContaining(expected));
    });

    it('confirm the list has duplicates from different modules', () => {
      const result = getDuplicatedKeys([...duplicatedKeysDiffModules]);

      const expected = [
        duplicatedKeysDiffModules[1],
        duplicatedKeysDiffModules[2],
      ];

      expect(result.length).toEqual(2);
      expect(result).toEqual(expect.arrayContaining(expected));
    });

    it('confirms the list has a deposited key and an undeposited duplicate from the same operator', () => {
      const result = getDuplicatedKeys([
        ...depositedAndUndepositedDuplicateSameOperator,
      ]);

      const expected = [depositedAndUndepositedDuplicateSameOperator[1]];

      expect(result.length).toEqual(1);
      expect(result).toEqual(expect.arrayContaining(expected));
      expect(result[0].used).toBeFalsy();
    });

    it('confirms the list has a deposited key and an undeposited duplicate from different operators of the same module', () => {
      const result = getDuplicatedKeys([
        ...depositedAndUndepositedDuplicateTwoOperatorsSameModule,
      ]);

      const expected = [
        depositedAndUndepositedDuplicateTwoOperatorsSameModule[1],
      ];

      expect(result.length).toEqual(1);
      expect(result).toEqual(expect.arrayContaining(expected));
    });

    it('confirms the list has a deposited key and an undeposited duplicate from different modules', () => {
      const result = getDuplicatedKeys([
        ...depositedAndUndepositedDuplicateDiffModules,
      ]);

      const expected = [depositedAndUndepositedDuplicateDiffModules[1]];

      expect(result.length).toEqual(1);
      expect(result).toEqual(expect.arrayContaining(expected));
    });
  });
});
