export class InconsistentLastChangedBlockHash extends Error {
  constructor(
    message = 'Since the last request, data in Kapi has been updated. This may result in inconsistencies between the data from two separate requests.',
  ) {
    super(message);
    this.name = 'InconsistentLastChangedBlockHash';

    Object.setPrototypeOf(this, InconsistentLastChangedBlockHash.prototype);
  }
}
