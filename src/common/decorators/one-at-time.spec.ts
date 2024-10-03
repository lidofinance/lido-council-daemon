import { OneAtTime, OneAtTimeCallId } from './one-at-time';

class TestOneAtTime {
  public value;
  public oneAtTimeCallId = new Map<number, number>();

  public executionLog: string[] = [];

  sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  @OneAtTime(2000)
  async test(value: number) {
    this.executionLog.push(`start-${value}`);
    this.value = value;

    await this.sleep(1000);
    this.executionLog.push(`end-${value}`);
  }

  @OneAtTime(2000)
  async testOneAtTimeCallId(@OneAtTimeCallId id, value) {
    this.executionLog.push(`start-${id}-${value}`);
    this.oneAtTimeCallId.set(id, value);

    await this.sleep(1000);
    this.executionLog.push(`end-${id}-${value}`);
  }
}

it('OneAtTime', async () => {
  const testOneAtTime = new TestOneAtTime();

  testOneAtTime.test(1);
  testOneAtTime.test(2);

  await testOneAtTime.sleep(1100);

  expect(testOneAtTime.value).toEqual(1);
  expect(testOneAtTime.executionLog).toEqual(['start-1', 'end-1']);

  testOneAtTime.executionLog = [];
  await testOneAtTime.test(2);

  expect(testOneAtTime.value).toEqual(2);
  expect(testOneAtTime.executionLog).toEqual(['start-2', 'end-2']);
});

it('StakingModuleId', async () => {
  const testOneAtTime = new TestOneAtTime();

  expect(testOneAtTime.oneAtTimeCallId.get(1)).toBeUndefined();
  expect(testOneAtTime.oneAtTimeCallId.get(2)).toBeUndefined();

  testOneAtTime.testOneAtTimeCallId(1, 1);
  testOneAtTime.testOneAtTimeCallId(1, 2);
  testOneAtTime.testOneAtTimeCallId(2, 2);

  await testOneAtTime.sleep(1500);

  expect(testOneAtTime.executionLog.length).toEqual(4);
  expect(testOneAtTime.executionLog).toEqual(
    expect.arrayContaining(['start-1-1', 'end-1-1', 'start-2-2', 'end-2-2']),
  );

  expect(testOneAtTime.oneAtTimeCallId.get(1)).toEqual(1);
  expect(testOneAtTime.oneAtTimeCallId.get(2)).toEqual(2);

  testOneAtTime.executionLog = [];
  await testOneAtTime.testOneAtTimeCallId(1, 2);

  expect(testOneAtTime.executionLog.length).toEqual(2);
  expect(testOneAtTime.executionLog).toEqual(
    expect.arrayContaining(['start-1-2', 'end-1-2']),
  );
  expect(testOneAtTime.oneAtTimeCallId.get(1)).toEqual(2);
});
