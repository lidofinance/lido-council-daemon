import { AllProvidersFailedError } from '@lido-nestjs/execution';
import { LoggerService } from '@nestjs/common';
import { sleep } from './sleep';

const FETCH_EVENTS_RETRY_TIMEOUT_MS = 5_000;
// TODO: connect this logic with fallback providers
/**
 * Returns events in the block range
 * If the request failed, it tries to repeat it or split it into two
 * @param startBlock - start of the range
 * @param endBlock - end of the range
 * @param fetcher - function that returns events
 * @param logger - logger service
 * @returns event group
 */
export async function fetchEventsFallOver<
  E extends unknown,
  T extends { events: E[]; startBlock: number; endBlock: number },
>(
  startBlock: number,
  endBlock: number,
  fetcher: (startBlock: number, endBlock: number) => Promise<T>,
  logger?: LoggerService,
): Promise<{ events: E[]; startBlock: number; endBlock: number }> {
  try {
    const data = await fetcher(startBlock, endBlock);
    return {
      events: data.events,
      startBlock: data.startBlock,
      endBlock: data.endBlock,
    };
  } catch (error: any) {
    const isPartitionRequired = error instanceof AllProvidersFailedError;

    const isPartitionable = endBlock - startBlock > 1;

    if (isPartitionable && isPartitionRequired) {
      logger?.debug?.(`Failing to get events, splitting into chunks`, {
        startBlock,
        endBlock,
      });

      const center = Math.ceil((endBlock + startBlock) / 2);
      const [first, second] = await Promise.all([
        fetchEventsFallOver(startBlock, center - 1, fetcher, logger),
        fetchEventsFallOver(center, endBlock, fetcher, logger),
      ]);

      const events = first.events.concat(second.events) as E[];

      return { events, startBlock, endBlock };
    } else {
      logger?.warn('Fetch error. Retry', error);

      await sleep(FETCH_EVENTS_RETRY_TIMEOUT_MS);
      return await fetchEventsFallOver(startBlock, endBlock, fetcher, logger);
    }
  }
}
