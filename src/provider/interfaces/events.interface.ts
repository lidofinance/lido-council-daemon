export interface EventGroup<E extends unknown> {
  events: E[];
  startBlock: number;
  endBlock: number;
}
