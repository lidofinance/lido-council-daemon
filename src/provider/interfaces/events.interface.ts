export interface EventGroup<E> {
  events: E[];
  startBlock: number;
  endBlock: number;
}
