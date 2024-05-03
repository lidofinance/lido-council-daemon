import 'reflect-metadata';
import { OneAtTime, StakingModuleId } from './one-at-time';

class TestOneAtTime {
  public value;
  public stakingModuleId = new Map<number, number>();

  sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  @OneAtTime()
  async test(value) {
    this.value = value;

    await this.sleep(3000);
  }

  @OneAtTime()
  async testStakingModuleId(@StakingModuleId id, value) {
    this.stakingModuleId.set(id, value);

    await this.sleep(3000);
  }
}

it('OneAtTime', async () => {
  const testOneAtTime = new TestOneAtTime();

  testOneAtTime.test(1);
  testOneAtTime.test(2);

  expect(testOneAtTime.value).toEqual(1);

  await testOneAtTime.sleep(3000);

  testOneAtTime.test(2);

  expect(testOneAtTime.value).toEqual(2);
});

it('StakingModuleId', async () => {
  const testOneAtTime = new TestOneAtTime();

  expect(testOneAtTime.stakingModuleId.get(1)).toBeUndefined();
  expect(testOneAtTime.stakingModuleId.get(2)).toBeUndefined();

  testOneAtTime.testStakingModuleId(1, 1);
  testOneAtTime.testStakingModuleId(1, 2);
  testOneAtTime.testStakingModuleId(2, 2);

  expect(testOneAtTime.stakingModuleId.get(1)).toEqual(1);
  expect(testOneAtTime.stakingModuleId.get(2)).toEqual(2);

  await testOneAtTime.sleep(3000);
  testOneAtTime.testStakingModuleId(1, 2);

  expect(testOneAtTime.stakingModuleId.get(1)).toEqual(2);
}, 6000);
