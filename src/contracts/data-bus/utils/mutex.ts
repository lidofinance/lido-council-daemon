export class Mutex {
  private currentPromise: Promise<void> | null = null;
  private resolver: (() => void) | null = null;

  async lock(): Promise<void> {
    // If the mutex is already locked, wait for it to be unlocked
    while (this.currentPromise) {
      await this.currentPromise;
    }

    // Create a new promise that will be resolved when unlock() is called
    this.currentPromise = new Promise<void>((resolve) => {
      this.resolver = resolve;
    });
  }

  unlock(): void {
    if (!this.resolver) {
      throw new Error('Mutex is not locked');
    }

    // Call the resolver to resolve the current promise and clear the lock state
    this.resolver();
    this.currentPromise = null;
    this.resolver = null;
  }
}
