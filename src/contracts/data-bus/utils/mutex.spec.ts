import { Mutex } from './mutex';

describe('Mutex', () => {
  let mutex: Mutex;

  beforeEach(() => {
    mutex = new Mutex();
  });

  it('should lock and unlock correctly', async () => {
    const executionOrder: number[] = [];

    // Function to simulate a critical section
    const criticalSection = async (id) => {
      await mutex.lock();
      executionOrder.push(id);
      // Simulate some work in the critical section
      await new Promise((resolve) => setTimeout(resolve, 100));
      mutex.unlock();
    };

    await Promise.all([criticalSection(222), criticalSection(444)]);

    // Check if execution order is sequential
    expect(executionOrder).toEqual([222, 444]);
  });

  it('should not allow unlocking when not locked', async () => {
    expect(() => mutex.unlock()).toThrow('Mutex is not locked');
  });

  it('should handle multiple locks without overlap', async () => {
    let firstLockDone = false;

    await mutex.lock();
    const firstLockPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        firstLockDone = true;
        mutex.unlock();
        resolve();
      }, 1000);
    });

    const secondLockPromise = new Promise<void>((resolve) => {
      setTimeout(async () => {
        await mutex.lock();
        // Check if the first lock finished before starting the second lock
        expect(firstLockDone).toBe(true);
        mutex.unlock();
        resolve();
      }, 100);
    });

    await Promise.all([firstLockPromise, secondLockPromise]);
  });
});
