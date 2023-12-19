export class InconsistentBlockhashError extends Error {
  constructor(
    message = 'Blockhash of the received keys does not match the blockhash of operators',
  ) {
    super(message);
    this.name = 'InconsistentBlockhashError';

    Object.setPrototypeOf(this, InconsistentBlockhashError.prototype);
  }
}
