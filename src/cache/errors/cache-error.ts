export class CacheError extends Error {
  public readonly name = CacheError.name;
  public readonly message: string;
  public readonly cause?: Error | string;

  public constructor(message: string, cause?: unknown) {
    super();
    Object.setPrototypeOf(this, new.target.prototype);
    this.message = message;
    if (typeof cause === 'string') {
      this.cause = cause;
    } else if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
