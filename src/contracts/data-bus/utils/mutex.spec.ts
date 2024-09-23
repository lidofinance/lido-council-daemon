import { Mutex } from './mutex';

describe('Mutex', () => {
  let mutex: Mutex;

  beforeEach(() => {
    mutex = new Mutex();
  });

  it('should lock and unlock correctly', async () => {
    const start = Date.now();
    let criticalSectionTime = 0;

    // Function to simulate a critical section
    const criticalSection = async () => {
      await mutex.lock();
      const startTime = Date.now();
      // Simulate some work in the critical section
      await new Promise((resolve) => setTimeout(resolve, 100));
      criticalSectionTime += Date.now() - startTime;
      mutex.unlock();
    };

    const promise1 = criticalSection();
    const promise2 = criticalSection();

    await Promise.all([promise1, promise2]);
    const totalTime = Date.now() - start;

    // Check if critical section times do not overlap
    expect(criticalSectionTime).toBeGreaterThanOrEqual(200);
    expect(totalTime).toBeGreaterThanOrEqual(criticalSectionTime);
  });

  it('should not allow unlocking when not locked', async () => {
    expect(() => mutex.unlock()).toThrow('Mutex is not locked');
  });

  it('should handle multiple locks without overlap', async () => {
    let firstLockDone = false;

    await mutex.lock();
    const firstLockPromise = new Promise<void>(async (resolve) => {
      // This lock should execute first
      await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate work
      firstLockDone = true;
      mutex.unlock();
      resolve();
    });

    const secondLockPromise = new Promise<void>(async (resolve) => {
      await mutex.lock();
      // Check if the first lock finished before starting the second lock
      expect(firstLockDone).toBe(true);
      mutex.unlock();
      resolve();
    });

    await Promise.all([firstLockPromise, secondLockPromise]);
  });
});
